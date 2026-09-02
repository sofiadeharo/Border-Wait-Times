"""
Stage 2 — border friction & the El Paso economy.

Fetches public monthly data, builds a panel, runs the econometrics, and writes
figures + JSON for the mockup front end. Reproducible end-to-end:

    cd analysis
    python -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/python analyze.py
"""
from __future__ import annotations

import io
import json
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import requests
import statsmodels.api as sm
from statsmodels.tsa.stattools import adfuller, coint, grangercausalitytests

HERE = pathlib.Path(__file__).parent
RAW = HERE / "data" / "raw"; RAW.mkdir(parents=True, exist_ok=True)
OUT = HERE / "output"; OUT.mkdir(parents=True, exist_ok=True)
DOCS = HERE.parent / "docs"; DOCS.mkdir(parents=True, exist_ok=True)
MOCK_DATA = HERE.parent / "mockup" / "src" / "data"; MOCK_DATA.mkdir(parents=True, exist_ok=True)

START = "2000-01-01"
SLOWDOWN = ("2019-03-01", "2019-08-31")   # CBP officer reassignment (6 months)
COVID = ("2020-04-01", "2021-10-31")      # land-border non-essential travel ban


# ---------------------------------------------------------------------------
# fetchers (cached to data/raw/)
# ---------------------------------------------------------------------------
def _cache(name: str, build):
    p = RAW / name
    if p.exists():
        return pd.read_csv(p, index_col=0, parse_dates=True)
    df = build()
    df.to_csv(p)
    return df


def fetch_bts() -> pd.DataFrame:
    """Monthly BTS border crossings for the El Paso, TX ports."""
    def build():
        url = "https://data.transportation.gov/resource/keg4-3bc2.json"
        ports = "'El Paso','Ysleta','Tornillo'"
        measures = "'Personal Vehicles','Pedestrians','Trucks','Bus Passengers'"
        params = {
            "$select": "date, measure, sum(value) as v",
            "$where": f"port_name in ({ports}) and measure in ({measures})",
            "$group": "date, measure",
            "$limit": 200000,
        }
        r = requests.get(url, params=params, timeout=90)
        r.raise_for_status()
        d = pd.DataFrame(r.json())
        d["date"] = pd.to_datetime(d["date"])
        d["v"] = pd.to_numeric(d["v"])
        wide = d.pivot_table(index="date", columns="measure", values="v", aggfunc="sum").sort_index()
        return wide.rename(columns={
            "Personal Vehicles": "crossings",
            "Pedestrians": "pedestrians",
            "Trucks": "trucks",
            "Bus Passengers": "bus_pax",
        })
    w = _cache("bts_crossings.csv", build)
    for c in ["crossings", "pedestrians", "trucks", "bus_pax"]:
        w[c] = w[c] / 1_000_000  # millions / month
    return w[["crossings", "pedestrians", "trucks", "bus_pax"]]


FRED_IDS = {
    "elpaso_emp": "LAUMT482134000000005",       # El Paso MSA employment (LAUS), persons
    "elpaso_unemp": "LAUMT482134000000004",     # El Paso MSA unemployment, persons
    "elpaso_retail_emp": "SMU48213404200000001",  # El Paso MSA retail-trade employment, thousands
    "mxn_usd": "DEXMXUS",                        # MXN / USD, daily
    "us_retail": "RSXFS",                        # US advance retail sales, $M
    "us_cpi": "CPIAUCSL",                        # US CPI, index
}


def fetch_fred() -> pd.DataFrame:
    def build():
        cols = {}
        for name, code in FRED_IDS.items():
            for attempt in range(3):
                try:
                    r = requests.get(
                        "https://fred.stlouisfed.org/graph/fredgraph.csv",
                        params={"id": code}, timeout=45,
                    )
                    r.raise_for_status()
                    s = pd.read_csv(io.StringIO(r.text), index_col=0, parse_dates=True).iloc[:, 0]
                    s = pd.to_numeric(s, errors="coerce")
                    cols[name] = s.resample("MS").mean()
                    print(f"  fred ok   {name:20s} {code}")
                    break
                except Exception as e:  # noqa: BLE001
                    print(f"  fred retry {name} ({e})"); time.sleep(2)
            else:
                print(f"  fred FAIL {name} {code}")
        return pd.concat(cols, axis=1)
    return _cache("fred.csv", build)


def fetch_taxable_sales() -> pd.DataFrame:
    """El Paso quarterly taxable sales by industry (Texas Comptroller, 2016+)."""
    def build():
        url = "https://data.texas.gov/resource/7z4d-yf2c.json"
        params = {
            "$where": "upper(name)='EL PASO' and type='City' and "
                      "industry in ('All Industries','Retail Trade','Accommodation/Food Services')",
            "$select": "year, qtr, industry, taxable, outlets",
            "$limit": 50000,
        }
        r = requests.get(url, params=params, timeout=60)
        r.raise_for_status()
        d = pd.DataFrame(r.json())
        d["date"] = pd.to_datetime(dict(
            year=d["year"].astype(int), month=d["qtr"].astype(int) * 3 - 2, day=1,
        ))
        d["taxable"] = pd.to_numeric(d["taxable"]) / 1e9  # $B / quarter
        w = d.pivot_table(index="date", columns="industry", values="taxable", aggfunc="sum").sort_index()
        return w.rename(columns={
            "All Industries": "sales_all", "Retail Trade": "sales_retail",
            "Accommodation/Food Services": "sales_accom",
        })
    return _cache("taxable_sales_qtr.csv", build)


def fetch_sales_tax() -> pd.DataFrame:
    """City of El Paso monthly sales-tax allocation payments (Texas Comptroller)."""
    def build():
        url = "https://data.texas.gov/resource/vfba-b57j.json"
        params = {
            "$where": "upper(city)='EL PASO' and report_period_type='MONTHLY'",
            "$select": "report_year, report_month, net_payment_this_period",
            "$limit": 50000,
        }
        r = requests.get(url, params=params, timeout=60)
        r.raise_for_status()
        d = pd.DataFrame(r.json())
        d["date"] = pd.to_datetime(
            d["report_year"].astype(int).astype(str) + "-" + d["report_month"].astype(int).astype(str) + "-01"
        )
        d["sales_tax"] = pd.to_numeric(d["net_payment_this_period"]) / 1_000_000  # $M
        # payments are made ~2 months after the underlying sales; shift to sale month
        return d.set_index("date")[["sales_tax"]].sort_index().shift(-2).dropna()
    return _cache("elpaso_sales_tax.csv", build)


# ---------------------------------------------------------------------------
# panel
# ---------------------------------------------------------------------------
def build_panel() -> pd.DataFrame:
    print("fetching BTS ..."); bts = fetch_bts()
    print("fetching FRED ..."); fred = fetch_fred()
    print("fetching Comptroller ..."); tax = fetch_sales_tax()

    p = pd.concat([bts, fred, tax], axis=1).loc[START:]
    p = p[p.index <= p["crossings"].last_valid_index()]
    p["elpaso_emp"] = p["elpaso_emp"] / 1000.0          # -> thousands, like retail
    p["unemp_rate"] = 100 * p["elpaso_unemp"] / (p["elpaso_unemp"] + p["elpaso_emp"] * 1000)
    p["mxn_usd_real"] = p["mxn_usd"] * (p["us_cpi"] / p["us_cpi"].iloc[-1])
    p = p.dropna(subset=["crossings"])

    for c in ["crossings", "pedestrians", "trucks", "bus_pax",
              "elpaso_emp", "elpaso_retail_emp", "sales_tax", "mxn_usd", "us_retail"]:
        p[f"l_{c}"] = np.log(p[c].where(p[c] > 0))

    # composite "border crossing activity" index = first principal component of the
    # four channels' standardized log levels (the common signal), rescaled to 0-100.
    CH = ["crossings", "pedestrians", "trucks", "bus_pax"]
    zz = pd.concat({c: (p[f"l_{c}"] - p[f"l_{c}"].mean()) / p[f"l_{c}"].std() for c in CH}, axis=1).dropna()
    u, s, vt = np.linalg.svd(zz.values - zz.values.mean(0), full_matrices=False)
    pc1 = pd.Series(u[:, 0] * s[0], index=zz.index)
    if pc1.corr(p.loc[zz.index, "l_crossings"]) < 0:
        pc1 = -pc1  # orient so higher = more activity
    p["border_activity"] = (pc1 - pc1.min()) / (pc1.max() - pc1.min()) * 100
    p["g_border_activity"] = p["border_activity"].diff(12)  # 12-month change, index points

    p["month"] = p.index.month
    p["t"] = np.arange(len(p))
    p["slowdown_2019"] = p.index.to_series().between(*SLOWDOWN).astype(float)
    p["covid_ban"] = p.index.to_series().between(*COVID).astype(float)
    p.to_csv(OUT / "panel_elpaso_juarez.csv")
    return p


# ---------------------------------------------------------------------------
# econometrics
# ---------------------------------------------------------------------------
def adf_p(s):
    s = s.dropna()
    return adfuller(s, autolag="AIC")[1] if len(s) > 12 else np.nan


def stationarity(p):
    rows = []
    for c in ["l_crossings", "l_elpaso_emp", "l_elpaso_retail_emp", "l_sales_tax", "mxn_usd"]:
        s = p[c].dropna()
        rows.append({
            "series": c,
            "adf_p_level": round(adf_p(s), 3),
            "adf_p_diff": round(adf_p(s.diff()), 3),
        })
    return pd.DataFrame(rows)


def engle_granger(p, y, x):
    d = p[[y, x]].dropna()
    _, pval, _ = coint(d[y], d[x])
    fit = sm.OLS(d[y], sm.add_constant(d[x])).fit()
    resid_p = adf_p(fit.resid)
    return {"pair": f"{y} ~ {x}", "coint_p": round(float(pval), 4),
            "resid_adf_p": round(float(resid_p), 4), "long_run_beta": round(float(fit.params[x]), 3),
            "cointegrated": bool(resid_p < 0.05)}


def granger(p, a, b, maxlag=4):
    import contextlib
    import os
    d = p[[a, b]].dropna().diff().dropna()
    with contextlib.redirect_stdout(open(os.devnull, "w")):
        res = grangercausalitytests(d[[a, b]], maxlag=maxlag)
    return {lag: round(res[lag][0]["ssr_ftest"][1], 4) for lag in range(1, maxlag + 1)}


def event_study(p, dep, window=SLOWDOWN):
    d = p.dropna(subset=[dep, "l_mxn_usd", "l_us_retail"]).copy()
    X = pd.DataFrame(index=d.index)
    X["slowdown_2019"] = d.index.to_series().between(*window).astype(float)
    X["covid_ban"] = d["covid_ban"]
    X["l_mxn_usd"] = d["l_mxn_usd"]
    X["l_us_retail"] = d["l_us_retail"]
    X["t"] = d["t"]
    for m in range(2, 13):
        X[f"m{m}"] = (d["month"] == m).astype(float)
    X = sm.add_constant(X)
    fit = sm.OLS(d[dep], X).fit(cov_type="HAC", cov_kwds={"maxlags": 6})

    def term(name):
        b = float(fit.params[name])
        return {"beta": round(b, 4), "se": round(float(fit.bse[name]), 4),
                "p": round(float(fit.pvalues[name]), 4), "pct": round(np.expm1(b) * 100, 2)}

    return {"dep": dep, "n": int(fit.nobs), "slowdown_2019": term("slowdown_2019"),
            "covid_ban": term("covid_ban")}


def seasonal_counterfactual(p, col, window=SLOWDOWN, base_years=(2016, 2017, 2018)):
    actual = p.loc[window[0]:window[1], col].dropna()
    if actual.empty:
        return np.array([]), np.array([])
    base = p[p.index.year.isin(base_years) & p.index.month.isin(actual.index.month)]
    seasonal = base.groupby(base.index.month)[col].mean()
    # scale the seasonal baseline onto the window's level with a log-linear trend
    v = np.log(p[col].where(p[col] > 0)).dropna()
    slope = np.polyfit(p.loc[v.index, "t"], v, 1)[0]
    scale = np.exp(slope * (p.loc[actual.index, "t"].mean() - p.loc[base.index, "t"].mean()))
    cf = seasonal.reindex(actual.index.month).to_numpy() * scale
    return actual.to_numpy(), cf


CHANNEL_LABELS = {
    "crossings": "Personal vehicles",
    "pedestrians": "Pedestrians",
    "trucks": "Trucks (freight)",
    "bus_pax": "Bus passengers",
    "border_activity": "Composite index",
}


def channels(p):
    """Core measurement: each border-crossing channel vs. regional economic activity."""
    d = p.copy()
    d["g_elpaso_emp"] = d["elpaso_emp"].pct_change(12) * 100
    d["g_elpaso_retail_emp"] = d["elpaso_retail_emp"].pct_change(12) * 100
    for c in ["crossings", "pedestrians", "trucks", "bus_pax"]:
        d[f"g_{c}"] = d[c].pct_change(12) * 100

    out = {"labels": CHANNEL_LABELS, "rows": []}
    for ch in ["crossings", "pedestrians", "trucks", "bus_pax", "border_activity"]:
        g = f"g_{ch}"
        gg = d[[g, "g_elpaso_emp"]].dropna()
        gr = d[[g, "g_elpaso_retail_emp"]].dropna()
        row = {
            "key": ch,
            "label": CHANNEL_LABELS[ch],
            "corr_emp_yoy": round(float(gg[g].corr(gg["g_elpaso_emp"])), 3) if len(gg) > 12 else None,
            "corr_retail_yoy": round(float(gr[g].corr(gr["g_elpaso_retail_emp"])), 3) if len(gr) > 12 else None,
        }
        if ch != "border_activity":
            ev = event_study(p, f"l_{ch}")
            row["e2019_pct"] = ev["slowdown_2019"]["pct"]
            row["e2019_p"] = ev["slowdown_2019"]["p"]
            row["ecovid_pct"] = ev["covid_ban"]["pct"]
            row["ecovid_p"] = ev["covid_ban"]["p"]
        out["rows"].append(row)

    # monthly frame for the front end: composite border activity vs El Paso employment, YoY growth
    fr = d[["g_border_activity", "g_elpaso_emp", "g_crossings", "g_trucks",
            "border_activity", "elpaso_emp"]].dropna(subset=["g_border_activity"])
    fr = fr.reset_index().rename(columns={"index": "date"})
    fr["date"] = fr["date"].dt.strftime("%Y-%m-%d")
    out["_frame"] = fr.round(2).astype(object).where(fr.round(2).notna(), None).to_dict(orient="records")

    gb = d[["g_border_activity", "g_elpaso_emp"]].dropna()
    out["composite_corr_emp_yoy"] = round(float(gb["g_border_activity"].corr(gb["g_elpaso_emp"])), 3)
    return out


def commerce(p):
    """Quarterly: does El Paso taxable retail spending track crossings / respond to shocks?"""
    q = fetch_taxable_sales()
    cx_q = p["crossings"].resample("QS").sum().to_frame("crossings")
    peso_q = p["mxn_usd"].resample("QS").mean().to_frame("mxn_usd")
    usr_q = p["us_retail"].resample("QS").sum().to_frame("us_retail")
    d = cx_q.join([q, peso_q, usr_q], how="inner").dropna()
    for c in ["crossings", "sales_all", "sales_retail", "sales_accom", "mxn_usd", "us_retail"]:
        d[f"l_{c}"] = np.log(d[c])
        d[f"g_{c}"] = d[c].pct_change(4) * 100  # year-over-year %

    out = {"n": int(len(d)), "start": str(d.index.min().date()), "end": str(d.index.max().date())}
    out["corr_levels"] = round(float(d[["crossings", "sales_retail"]].corr().iloc[0, 1]), 3)
    yoy = d[["g_crossings", "g_sales_retail"]].dropna()
    out["corr_yoy_growth"] = round(float(yoy.iloc[:, 0].corr(yoy.iloc[:, 1])), 3)

    # quarterly event study on retail spending
    d["slowdown_2019"] = d.index.to_series().between("2019-01-01", "2019-09-30").astype(float)
    d["covid"] = d.index.to_series().between("2020-04-01", "2021-06-30").astype(float)
    for dep in ["l_sales_retail", "l_sales_accom", "l_sales_all"]:
        X = d[["slowdown_2019", "covid", "l_mxn_usd", "l_us_retail"]].copy()
        X["q"] = d.index.quarter
        X = pd.get_dummies(X, columns=["q"], drop_first=True).astype(float)
        m = sm.OLS(d[dep], sm.add_constant(X)).fit(cov_type="HAC", cov_kwds={"maxlags": 4})
        out[dep] = {"slowdown_2019_pct": round(np.expm1(m.params["slowdown_2019"]) * 100, 2),
                    "slowdown_2019_p": round(float(m.pvalues["slowdown_2019"]), 3),
                    "covid_pct": round(np.expm1(m.params["covid"]) * 100, 2),
                    "covid_p": round(float(m.pvalues["covid"]), 3)}

    frame = d[["g_crossings", "g_sales_retail", "g_sales_all", "crossings", "sales_retail"]].round(2)
    frame = frame.reset_index().rename(columns={"index": "date"})
    frame["date"] = frame["date"].dt.strftime("%Y-%m-%d")
    out["_frame"] = frame.astype(object).where(frame.notna(), None).to_dict(orient="records")
    return out


# ---------------------------------------------------------------------------
def main():
    p = build_panel()
    print(f"\npanel: {p.index.min().date()} .. {p.index.max().date()}  ({len(p)} months)\n")

    print(stationarity(p).to_string(index=False), "\n")

    eg = [engle_granger(p, "l_elpaso_emp", "l_crossings"),
          engle_granger(p, "l_elpaso_retail_emp", "l_crossings")]
    for e in eg:
        print(f"  Engle-Granger {e['pair']:35s} coint p={e['coint_p']:.3f}  resid ADF p={e['resid_adf_p']:.3f}"
              f"  beta={e['long_run_beta']}  -> {'COINTEGRATED' if e['cointegrated'] else 'no'}")

    g_fwd = granger(p, "l_elpaso_emp", "l_crossings")
    g_rev = granger(p, "l_crossings", "l_elpaso_emp")
    print(f"\n  Granger crossings -> El Paso emp : p by lag {g_fwd}")
    print(f"  Granger El Paso emp -> crossings : p by lag {g_rev}\n")

    deps = ["l_crossings", "l_pedestrians", "l_elpaso_emp", "l_elpaso_retail_emp", "l_sales_tax"]
    ev = {d: event_study(p, d) for d in deps}
    print("  2019 CBP officer reassignment (Mar–Aug 2019)          COVID land-border ban (Apr'20–Oct'21)")
    for e in ev.values():
        s, c = e["slowdown_2019"], e["covid_ban"]
        print(f"  {e['dep']:20s}  {s['pct']:+6.1f}%  (p={s['p']:.3f})          {c['pct']:+7.1f}%  (p={c['p']:.3f})")

    # robustness: alternative 2019 windows
    print("\n  crossings effect by window:")
    for w in [("2019-03-01", "2019-08-31"), ("2019-04-01", "2019-07-31"), ("2019-03-01", "2019-06-30")]:
        e = event_study(p, "l_crossings", window=w)["slowdown_2019"]
        print(f"    {w[0][:7]}..{w[1][:7]}  {e['pct']:+.1f}%  (p={e['p']:.3f})")

    # sales-tax dollar move over the window (seasonal counterfactual)
    st_actual, st_cf = seasonal_counterfactual(p, "sales_tax")
    loss_cf = float(np.nansum(st_cf - st_actual)) if st_cf.size else float("nan")
    base_monthly = float(np.nanmean(st_cf)) if st_cf.size else float("nan")
    print(f"\n  El Paso sales-tax vs. seasonal counterfactual over the window: "
          f"${loss_cf:+,.1f}M  (baseline ~${base_monthly:.1f}M/mo, n={st_actual.size})")

    cx_actual, cx_cf = seasonal_counterfactual(p, "crossings")
    cx_drop_pct = float(np.nansum(cx_actual - cx_cf) / np.nansum(cx_cf) * 100)

    # ---- border-crossing activity, by channel, vs. regional economic activity ----
    ch = channels(p)
    print("\n  BORDER CROSSING ACTIVITY vs. REGIONAL ECONOMY (YoY growth correlation + shock effects)")
    print(f"  {'channel':18s} {'corr w/ El Paso emp':>18s} {'corr w/ retail emp':>18s}   2019 shock      COVID shock")
    for r in ch["rows"]:
        e19 = f"{r['e2019_pct']:+.0f}% (p={r['e2019_p']:.2f})" if "e2019_pct" in r else "—"
        ecv = f"{r['ecovid_pct']:+.0f}% (p={r['ecovid_p']:.2f})" if "ecovid_pct" in r else "—"
        print(f"  {r['label']:18s} {str(r['corr_emp_yoy']):>18s} {str(r['corr_retail_yoy']):>18s}   {e19:16s} {ecv}")
    print(f"  composite border activity vs El Paso employment, YoY growth: r = {ch['composite_corr_emp_yoy']:+.2f}")

    # ---- commerce channel (quarterly taxable retail sales) ----
    com = commerce(p)
    print(f"\n  COMMERCE (quarterly taxable sales, {com['start']}..{com['end']}, n={com['n']}):")
    print(f"    corr(crossings, retail sales) levels : {com['corr_levels']:+.2f}")
    print(f"    corr(crossings, retail sales) YoY %  : {com['corr_yoy_growth']:+.2f}")
    for k in ["l_sales_retail", "l_sales_accom", "l_sales_all"]:
        e = com[k]
        print(f"    {k:16s}  2019: {e['slowdown_2019_pct']:+5.1f}% (p={e['slowdown_2019_p']:.2f})   "
              f"COVID: {e['covid_pct']:+6.1f}% (p={e['covid_p']:.2f})")

    # ---- figures ----
    make_figures(p)

    # ---- exports for the mockup ----
    pearson = float(p[["crossings", "elpaso_emp"]].corr().iloc[0, 1])
    cx, ped, rt, st = ev["l_crossings"], ev["l_pedestrians"], ev["l_elpaso_retail_emp"], ev["l_sales_tax"]
    findings = {
        "generated_at": pd.Timestamp.utcnow().isoformat(),
        "sample": {"start": str(p.index.min().date()), "end": str(p.index.max().date()), "n": int(len(p))},
        "headline": {
            "stat": f"{cx['slowdown_2019']['pct']:.0f}%",
            "label": "drop in El Paso personal-vehicle crossings during the 2019 CBP officer "
                     "reassignment (Mar–Aug), net of seasonality, trend, the peso and US retail sales — "
                     f"while pedestrian crossings rose {ped['slowdown_2019']['pct']:+.0f}% as travelers switched modes",
        },
        "pearson_crossings_activity": round(pearson, 3),
        "cointegration": {
            "pair": "El Paso crossings ~ retail-trade employment (log levels, 2000–2026)",
            "resid_adf_p": eg[1]["resid_adf_p"],
            "long_run_beta": eg[1]["long_run_beta"],
            "cointegrated": eg[1]["cointegrated"],
        },
        "granger": {
            "crossings_to_activity_p": min(g_fwd.values()),
            "activity_to_crossings_p": min(g_rev.values()),
        },
        "event_2019": {
            "window": "2019-03 .. 2019-08",
            "crossings_pct": cx["slowdown_2019"]["pct"], "crossings_p": cx["slowdown_2019"]["p"],
            "pedestrians_pct": ped["slowdown_2019"]["pct"], "pedestrians_p": ped["slowdown_2019"]["p"],
            "retail_emp_pct": rt["slowdown_2019"]["pct"], "retail_emp_p": rt["slowdown_2019"]["p"],
            "sales_tax_pct": st["slowdown_2019"]["pct"], "sales_tax_p": st["slowdown_2019"]["p"],
            "sales_tax_move_musd": round(loss_cf, 1),
            "crossings_drop_pct_raw": round(cx_drop_pct, 1),
        },
        "event_covid": {
            "window": "2020-04 .. 2021-10",
            "crossings_pct": cx["covid_ban"]["pct"], "crossings_p": cx["covid_ban"]["p"],
            "retail_emp_pct": rt["covid_ban"]["pct"], "retail_emp_p": rt["covid_ban"]["p"],
        },
        "channels": {
            "composite_corr_emp_yoy": ch["composite_corr_emp_yoy"],
            "rows": ch["rows"],
        },
        "commerce": {
            "sample": f"{com['start'][:7]} .. {com['end'][:7]} (quarterly, n={com['n']})",
            "corr_crossings_retail_levels": com["corr_levels"],
            "corr_crossings_retail_yoy": com["corr_yoy_growth"],
            "retail_2019_pct": com["l_sales_retail"]["slowdown_2019_pct"],
            "retail_2019_p": com["l_sales_retail"]["slowdown_2019_p"],
            "retail_covid_pct": com["l_sales_retail"]["covid_pct"],
            "retail_covid_p": com["l_sales_retail"]["covid_p"],
            "accom_2019_pct": com["l_sales_accom"]["slowdown_2019_pct"],
            "accom_covid_pct": com["l_sales_accom"]["covid_pct"],
        },
        "note": "Estimates from analyze.py. Event effects are HAC-robust (Newey–West, 6 lags) OLS on "
                "log monthly series with month fixed effects, a linear time trend, and log peso / "
                "log US-retail controls. Cointegration: Engle–Granger two-step.",
    }
    (MOCK_DATA / "findings.json").write_text(json.dumps(findings, indent=2))
    (MOCK_DATA / "commerce.json").write_text(json.dumps(com.pop("_frame"), separators=(",", ":")))
    (MOCK_DATA / "channels.json").write_text(json.dumps(ch.pop("_frame"), separators=(",", ":")))

    cols = ["crossings", "pedestrians", "trucks", "bus_pax", "elpaso_emp",
            "elpaso_retail_emp", "sales_tax", "mxn_usd", "unemp_rate"]
    out = p[cols].reset_index().rename(columns={"index": "date"})
    out["date"] = out["date"].dt.strftime("%Y-%m-%d")
    (MOCK_DATA / "panel.json").write_text(out.to_json(orient="records"))
    print(f"\nwrote {MOCK_DATA/'findings.json'} and {MOCK_DATA/'panel.json'}")
    print(json.dumps(findings, indent=2))


def make_figures(p):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(2, 1, figsize=(11, 7), sharex=True)
    ax[0].plot(p.index, p["crossings"], color="#c0563b", lw=1.2)
    ax[0].set_ylabel("crossings (M / mo)")
    ax[1].plot(p.index, p["elpaso_emp"], color="#2f6f6a", lw=1.4)
    ax[1].set_ylabel("El Paso employment (k)")
    for a in ax:
        a.axvspan(*[pd.Timestamp(x) for x in SLOWDOWN], color="#c0563b", alpha=.15)
        a.axvspan(*[pd.Timestamp(x) for x in COVID], color="#5c574d", alpha=.12)
        a.grid(alpha=.3)
    fig.suptitle("El Paso border crossings vs. employment")
    fig.tight_layout(); fig.savefig(DOCS / "fig_timeseries.png", dpi=130); plt.close(fig)

    sub = p.dropna(subset=["crossings", "elpaso_emp"])
    fig, ax = plt.subplots(figsize=(6, 5))
    sc = ax.scatter(sub["crossings"], sub["elpaso_emp"], c=sub.index.year, cmap="viridis", s=14)
    b, a0 = np.polyfit(sub["crossings"], sub["elpaso_emp"], 1)
    xs = np.linspace(sub["crossings"].min(), sub["crossings"].max(), 50)
    ax.plot(xs, a0 + b * xs, color="#c0563b")
    r = sub["crossings"].corr(sub["elpaso_emp"])
    ax.set(xlabel="monthly crossings (M)", ylabel="El Paso employment (k)", title=f"r = {r:.2f}")
    fig.colorbar(sc, label="year"); fig.tight_layout()
    fig.savefig(DOCS / "fig_scatter.png", dpi=130); plt.close(fig)
    print(f"wrote figures to {DOCS}")


if __name__ == "__main__":
    sys.exit(main())
