import Link from "next/link"
import Image from "next/image"

export default function Landing() {
  return (
    <main className="landing-root" style={{fontFamily: "Inter, system-ui, -apple-system, Roboto, 'Helvetica Neue', Arial", color: "#0f1720"}}>
      <style>{`
        .landing-root { background: linear-gradient(180deg,#fbfdff 0%, #f6fbff 100%); min-height:100vh; }
        .container { max-width:1200px; margin:0 auto; padding:64px 24px; }
        .hero { display:flex; gap:48px; align-items:center; justify-content:space-between; }
        .hero-left { flex:1; }
        .kicker { display:inline-block; background:#0ea5a4; color:#042f2e; padding:6px 10px; border-radius:999px; font-weight:700; font-size:13px; }
        h1 { font-size:48px; line-height:1.02; margin:18px 0 12px; color:#071023; }
        p.lead { color:#334155; font-size:18px; margin-bottom:20px; }
        .features { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin-top:20px; }
        .feature { background:#fff; border:1px solid rgba(9,30,66,0.04); padding:16px; border-radius:12px; box-shadow:0 6px 18px rgba(16,24,40,0.04); }
        .ctas { margin-top:28px; display:flex; gap:12px; align-items:center; }
        .btn-primary { background:#0f1724; color:#fff; padding:12px 18px; border-radius:10px; font-weight:700; text-decoration:none; }
        .btn-ghost { border:1px solid rgba(15,23,36,0.08); background:transparent; color:#0f1724; padding:12px 18px; border-radius:10px; text-decoration:none; }
        .hero-right { width:460px; flex:0 0 460px; }
        .panel { border-radius:16px; padding:18px; background:linear-gradient(180deg,#ffffff,#f8fbff); border:1px solid rgba(9,30,66,0.04); box-shadow: 0 10px 30px rgba(15,23,42,0.06);} 
        .screenshot { width:100%; height:300px; border-radius:10px; background:linear-gradient(90deg,#e6f6f6,#eef7fb); display:flex; align-items:center; justify-content:center; color:#0f1724; font-weight:700; }
        .section { margin-top:56px; }
        .grid-3 { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
        .card { background:#fff; padding:20px; border-radius:12px; border:1px solid rgba(9,30,66,0.04); }
        footer { margin-top:72px; padding:28px 0; text-align:center; color:#64748b; font-size:14px; }
        @media (max-width:900px){ .hero{flex-direction:column-reverse}.hero-right{width:100%;flex:unset}.grid-3{grid-template-columns:1fr} .features{grid-template-columns:1fr} }
      `}</style>

      <div className="container">
        <div className="hero">
          <div className="hero-left">
            <span className="kicker">New — Version Intelligence</span>
            <h1>PulseDock — Ship with confidence. Know every change.</h1>
            <p className="lead">Understand version drift across environments, get precise changelog summaries, and publish status pages — all with enterprise reliability and delightful UX.</p>

            <div className="features">
              <div className="feature">
                <strong>Realtime monitoring</strong>
                <div style={{marginTop:8,color:'#475569'}}>Track versions across hosts with live status and historical timelines.</div>
              </div>
              <div className="feature">
                <strong>Changelog summarization</strong>
                <div style={{marginTop:8,color:'#475569'}}>AI-assisted bullet summaries for releases and dependency updates.</div>
              </div>
              <div className="feature">
                <strong>Public status pages</strong>
                <div style={{marginTop:8,color:'#475569'}}>Share uptime and version history with stakeholders via public pages.</div>
              </div>
              <div className="feature">
                <strong>Enterprise controls</strong>
                <div style={{marginTop:8,color:'#475569'}}>Role-based access, audit logs, and single sign-on integrations.</div>
              </div>
            </div>

            <div className="ctas">
              <a className="btn-primary" href="/login">Get started — Sign in</a>
              <a className="btn-ghost" href="/projects/PulseDock/docs/START.md">Read docs</a>
            </div>

          </div>

          <div className="hero-right">
            <div className="panel">
              <div className="screenshot">
                <div>PulseDock UI preview</div>
              </div>
              <div style={{display:'flex', justifyContent:'space-between', marginTop:12}}>
                <div style={{fontWeight:700}}>Live Overview</div>
                <div style={{color:'#94a3b8'}}>Updated 2m ago</div>
              </div>
            </div>
          </div>
        </div>

        <section className="section">
          <h2>Designed for teams — built for scale</h2>
          <p style={{color:'#475569'}}>PulseDock balances simplicity and control: quick setup for small teams, advanced governance for large organizations.</p>

          <div className="grid-3" style={{marginTop:18}}>
            <div className="card">
              <h4>Integrations</h4>
              <p style={{color:'#475569'}}>Connect to your CI, artifact registries, and notification channels (Slack, Email, PagerDuty).</p>
            </div>
            <div className="card">
              <h4>Privacy-first</h4>
              <p style={{color:'#475569'}}>Run self-hosted or in your cloud; data remains yours. Optional telemetry is off by default.</p>
            </div>
            <div className="card">
              <h4>Extensible</h4>
              <p style={{color:'#475569'}}>Create custom monitors and plugins with a small SDK.</p>
            </div>
          </div>
        </section>

        <section className="section">
          <h2>Why teams choose PulseDock</h2>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginTop:12}}>
            <div className="card">
              <strong>Fewer incident investigations</strong>
              <p style={{color:'#475569'}}>Aggregate version telemetry and reduce mean time to resolution.</p>
            </div>
            <div className="card">
              <strong>Safer upgrades</strong>
              <p style={{color:'#475569'}}>Preview changes, run canary monitors, and rollback with context.</p>
            </div>
          </div>
        </section>

        <section className="section">
          <h3>Start in minutes</h3>
          <ol style={{color:'#475569'}}>
            <li>Run the Docker dependencies.</li>
            <li>Apply database migrations (prisma).</li>
            <li>Start API + Web using the repo wrappers.</li>
          </ol>
        </section>

        <footer>
          © {new Date().getFullYear()} PulseDock — Built with care.
        </footer>
      </div>
    </main>
  )
}
