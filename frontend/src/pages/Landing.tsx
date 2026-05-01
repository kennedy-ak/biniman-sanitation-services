import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getHealth } from '@/api/health'

export function Landing() {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth })
  const status = health.isLoading
    ? 'checking'
    : health.isError
      ? 'offline'
      : health.data?.status === 'ok'
        ? 'online'
        : 'unknown'

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-[#084d29] text-white">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, #6FCF97 0%, transparent 40%), radial-gradient(circle at 80% 70%, #D4A017 0%, transparent 35%)',
          }}
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16 md:pt-20 md:pb-28">
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
                <span className={`w-2 h-2 rounded-full ${
                  status === 'online' ? 'bg-[#6FCF97]' : status === 'offline' ? 'bg-red-400' : 'bg-amber-300'
                } animate-pulse`} />
                Live in Kumasi
              </div>
              <h1 className="mt-5 font-heading text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.05] tracking-tight">
                Liquid waste,
                <br />
                <span className="text-accent">handled in minutes.</span>
              </h1>
              <p className="mt-6 text-lg text-white/85 max-w-lg">
                Biniman Sanitation Services connects you to verified septic,
                soak-pit, and industrial waste drivers on demand. Transparent
                pricing, mobile money, fully tracked.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/signup"
                  className="bg-accent text-charcoal font-bold px-6 py-3.5 rounded-lg hover:brightness-110 transition shadow-lg shadow-black/20"
                >
                  Request a pickup →
                </Link>
                <Link
                  to="/signup"
                  className="bg-white/10 backdrop-blur-sm border border-white/30 text-white font-semibold px-6 py-3.5 rounded-lg hover:bg-white/20 transition"
                >
                  Drive with us
                </Link>
              </div>
              <div className="mt-10 grid grid-cols-3 gap-4 sm:flex sm:gap-8 text-sm">
                <Stat label="Avg. match" value="< 5 min" />
                <Stat label="Verified" value="100%" />
                <Stat label="Pay via" value="MoMo / Card" />
              </div>
            </div>

            {/* Phone mockup card */}
            <div className="relative">
              <div className="absolute -inset-4 bg-accent/20 blur-3xl rounded-full" />
              <div className="relative bg-white text-charcoal rounded-2xl shadow-2xl p-5 max-w-sm mx-auto">
                <div className="flex items-center justify-between text-xs text-charcoal/60">
                  <span>Active request</span>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-semibold uppercase tracking-wide">
                    En route
                  </span>
                </div>
                <div className="mt-3 font-bold text-lg">Septic · Medium tank</div>
                <div className="text-sm text-charcoal/70">Adum, Kumasi</div>

                <div className="mt-4 h-40 rounded-xl bg-gradient-to-br from-primary-light/40 to-sky/30 relative overflow-hidden">
                  <div className="absolute top-4 left-4 w-3 h-3 rounded-full bg-primary ring-4 ring-primary/30" />
                  <div className="absolute bottom-6 right-8 w-7 h-7 rounded-full bg-accent grid place-items-center text-sm shadow-md">
                    🚛
                  </div>
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 160" fill="none">
                    <path
                      d="M 20 20 Q 80 60 110 90 T 170 130"
                      stroke="#0B6B3A"
                      strokeWidth="2.5"
                      strokeDasharray="5 4"
                      fill="none"
                    />
                  </svg>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary text-white grid place-items-center font-bold">
                    KM
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">Kofi M.</div>
                    <div className="text-xs text-charcoal/60">★ 4.9 · GR-2451-22</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-charcoal/50">Quote</div>
                    <div className="font-bold">GHS 180</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto">
          <div className="text-xs font-bold uppercase tracking-widest text-accent">
            How it works
          </div>
          <h2 className="mt-2 font-heading text-3xl md:text-4xl font-extrabold text-charcoal">
            Three taps to a clean tank.
          </h2>
        </div>
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <Step
            num="1"
            title="Tell us the job"
            body="Pick waste type and tank size. Drop a pin or type the address."
          />
          <Step
            num="2"
            title="Get matched"
            body="Closest verified driver gets the offer. See the price up front."
          />
          <Step
            num="3"
            title="Pay & rate"
            body="Pay by MoMo or card after the job. Both sides rate each other."
          />
        </div>
      </section>

      {/* Features */}
      <section className="bg-gradient-to-b from-white to-primary/5 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              icon="⚡"
              title="On-demand"
              body="Septic, soak pit, industrial — request now, get matched to the closest verified driver."
            />
            <FeatureCard
              icon="💰"
              title="Transparent"
              body="See the exact price before you book. No haggling. No surprises."
            />
            <FeatureCard
              icon="🛡️"
              title="Verified"
              body="Every driver is ID-verified and EPA-permitted. Both sides rated after every job."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="rounded-3xl bg-gradient-to-r from-primary to-[#084d29] text-white p-12 md:p-16 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-accent/30 blur-3xl" />
          <div className="relative grid md:grid-cols-[1fr_auto] gap-8 items-center">
            <div>
              <h2 className="font-heading text-3xl md:text-4xl font-extrabold">
                Ready to skip the queue?
              </h2>
              <p className="mt-3 text-white/85 max-w-xl">
                Sign up in under a minute with just your phone number. No
                paperwork, no downloads.
              </p>
            </div>
            <Link
              to="/signup"
              className="bg-accent text-charcoal font-bold px-8 py-4 rounded-lg hover:brightness-110 transition text-center shadow-lg"
            >
              Get started free →
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-heading font-extrabold text-xl text-accent">{value}</div>
      <div className="text-xs text-white/70 uppercase tracking-wider">{label}</div>
    </div>
  )
}

function Step({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-charcoal/5 shadow-sm hover:shadow-md transition">
      <div className="w-12 h-12 rounded-xl bg-primary text-white grid place-items-center font-heading font-extrabold text-xl">
        {num}
      </div>
      <h3 className="mt-4 text-xl font-bold text-charcoal">{title}</h3>
      <p className="mt-2 text-sm text-charcoal/70 leading-relaxed">{body}</p>
    </div>
  )
}

function FeatureCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="bg-white border border-charcoal/5 rounded-2xl p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition">
      <div className="w-12 h-12 rounded-xl bg-accent/15 grid place-items-center text-2xl">
        {icon}
      </div>
      <h3 className="mt-4 text-xl font-bold text-charcoal">{title}</h3>
      <p className="mt-2 text-sm text-charcoal/70 leading-relaxed">{body}</p>
    </div>
  )
}
