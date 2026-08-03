import CommentsSection from '../components/CommentsSection'

// LAYOUT: static content page — each `<section>` below is a self-contained
// card; add/remove/reorder `<section>` blocks to change the topics covered.
// COLORS: cards use a low-opacity white ("frosted glass") treatment —
// `bg-white/40 dark:bg-white/10 backdrop-blur-md` — so the background photo
// stays visible through them. Keep new sections consistent with this class.
export default function Blog() {
  return (
    <main className="min-h-screen p-8 font-sans">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-blackberry-cream dark:text-almond-cream">
            The Who and The Why
          </h1>
          <p className="text-sm text-blackberry-cream/60 dark:text-almond-cream/60 mt-1">
Meet the purpose of the project          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 rounded-lg">
        {}
          <div className="p-4 rounded-lg bg-white/30 dark:bg-white/10 backdrop-blur-lg">
            <h2 className="text-lg font-medium text-blackberry-cream dark:text-almond-cream mb-2">
              A Little About Me!
            </h2>
            <p>
              My name is Sofia De Haro,  a Data Analytics and Computer Science student at UTEP. With a background in AI education and machine learning implementations, I built this platform to apply advanced predictive modeling to regional transit challenges at the US-Mexico border.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-white/30 dark:bg-white/10 backdrop-blur-lg">
            <h2 className="text-lg font-medium text-blackberry-cream dark:text-almond-cream mb-2">
              Why This Project?
            </h2>
            <p>               I built this project to address the lack of real-time information about wait times at the US-Mexico border. By leveraging data analytics and machine learning, I aim to provide travelers with more accurate and timely information to help them plan their journeys.

            </p>
          </div>

        </div>
        <article className="space-y-6 text-sm leading-relaxed text-blackberry-cream/90 dark:text-almond-cream/90">
          <section className="rounded-lg border border-white/40 dark:border-white/10 bg-white/30 dark:bg-white/10 backdrop-blur-lg p-5">
            <h2 className="text-lg font-medium text-blackberry-cream dark:text-almond-cream mb-2">
              Official crossing data
            </h2>
            <p>
              Every hour, I pull published wait times for the Bridge of the Americas (BOTA) directly
              from U.S. Customs and Border Protection&apos;s public feed. I store each reading port,
              lane type, wait time, and timestamp,  so the site can show current conditions and so I
              can look back at historical patterns (rush hours, weekday vs. weekend, holidays).
            </p>
          </section>

          <section className="rounded-lg border border-white/40 dark:border-white/10 bg-white/30 dark:bg-white/10 backdrop-blur-lg p-5">
            <h2 className="text-lg font-medium text-blackberry-cream dark:text-almond-cream mb-2">
              Weather and holiday context
            </h2>
            <p>
              The program also logs weather conditions near the crossing and a calendar of U.S. and Mexican
              holidays, school breaks, and bridge days. Wait times swing a lot around these events, and
              having this context stored alongside crossing data lets us understand and eventually
              predict those swings, rather than just reporting raw numbers.
            </p>
          </section>

          <section className="rounded-lg border border-white/40 dark:border-white/10 bg-white/30 dark:bg-white/10 backdrop-blur-lg p-5">
            <h2 className="text-lg font-medium text-blackberry-cream dark:text-almond-cream mb-2">
              Community-reported wait times
            </h2>
            <p>
              Official feeds aren&apos;t always timely. When you submit a report, we store the
              lane type, when you crossed, how long you waited, and any notes you add. These reports
              fill gaps in the official data and, over time, help train a model that predicts wait times
              for a given day and hour.
            </p>
            <p className="mt-3">
              We also store the IP address you submitted from, not tied to any account or identity, and
              never shown publicly. Its only purpose is abuse prevention: each IP is capped at 5 reports
              so one person can&apos;t flood the system with fake data and skew what everyone else sees.
            </p>
          </section>

          <section className="rounded-lg border border-white/40 dark:border-white/10 bg-white/30 dark:bg-white/10 backdrop-blur-lg p-5">
            <h2 className="text-lg font-medium text-blackberry-cream dark:text-almond-cream mb-2">
              What we don&apos;t do
            </h2>
            <p>
              We don&apos;t require accounts, collect names, or ask for anything beyond what&apos;s on the
              report form above. We don&apos;t sell or share this data with third parties. It exists to keep
              this page accurate and to make border wait times more predictable for the community that
              crosses every day.
            </p>
          </section>

          {/* LAYOUT: photo placeholders — drop real images into frontend/public/ and
              replace each placeholder `<div>` with a Next.js <Image>. */}
          {/* <section className="rounded-lg border border-white/40 dark:border-white/10 bg-white/30 dark:bg-white/10 backdrop-blur-lg p-5">
            <h2 className="text-lg font-medium text-blackberry-cream dark:text-almond-cream mb-1">
              Photos from the Bridge
            </h2>
            <p className="text-xs text-blackberry-cream/50 dark:text-almond-cream/50 mb-4">
              Placeholder slots for now — swap these in once photos are ready.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="aspect-video rounded-md border-2 border-dashed border-blackberry-cream/20 dark:border-almond-cream/20 flex items-center justify-center text-xs text-blackberry-cream/40 dark:text-almond-cream/40"
                >
                  Photo {i}
                </div>
              ))}
            </div>
          </section> */}

          {/* LAYOUT: general announcements — not tied to code changes, edit freely. */}
          <section className="rounded-lg border border-white/40 dark:border-white/10 bg-white/30 dark:bg-white/10 backdrop-blur-lg p-5">
            <h2 className="text-lg font-medium text-blackberry-cream dark:text-almond-cream mb-3">
              Updates
            </h2>
            <ul className="space-y-3">
              <li>
                <p className="text-sm font-medium text-blackberry-cream dark:text-almond-cream">
                  Interactive bridge map added
                </p>
                <p className="text-xs text-blackberry-cream/60 dark:text-almond-cream/60">
                  Pick a port of entry on the map to see its wait times broken down by lane.
                </p>
              </li>
              <li>
                <p className="text-sm font-medium text-blackberry-cream dark:text-almond-cream">
                  Community wait-time reports launched
                </p>
                <p className="text-xs text-blackberry-cream/60 dark:text-almond-cream/60">
                  Crossed recently? Share your wait time from the Wait Times tab.
                </p>
              </li>
            </ul>
          </section>

          
        </article>
      </div>
    </main>
  )
}
