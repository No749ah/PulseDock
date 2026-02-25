"use client"

import Link from "next/link";
import { motion, useAnimation } from 'framer-motion'
import { useEffect } from 'react'

export default function Landing() {
  const controls = useAnimation()
  useEffect(()=>{ controls.start({ opacity:1, y:0, transition:{ duration:0.6 } }) },[controls])
  return (
    <main className="landing-root">
      <style>{`
        :root{--bg:#07121a;--card:#09202a;--muted:#9fb1bc;--accent:#22d3c9;--glass:rgba(255,255,255,0.03)}
        *{box-sizing:border-box}
        html,body{height:100%;margin:0}
        .landing-root{min-height:100vh;background:radial-gradient(800px 400px at 10% 10%, rgba(34,211,201,0.06), transparent), radial-gradient(700px 400px at 90% 80%, rgba(99,102,241,0.06), transparent), linear-gradient(180deg,var(--bg), #031019); color:#e6f3f2; font-family:Inter, system-ui, -apple-system, 'Helvetica Neue', Arial}
        .container{max-width:1200px;margin:0 auto;padding:64px 24px}
        .hero{display:flex;gap:40px;align-items:center}
        .left{flex:1}
        .kicker{display:inline-block;background:linear-gradient(90deg,var(--accent),#60a5fa);color:#021619;padding:6px 12px;border-radius:999px;font-weight:700;font-size:13px}
        h1{font-size:44px;line-height:1.02;margin:16px 0;color:#eafefd;text-shadow:0 6px 30px rgba(0,0,0,0.6)}
        p.lead{color:var(--muted);font-size:17px}
        .features{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:20px}
        .feature{background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));border:1px solid rgba(255,255,255,0.03);padding:14px;border-radius:12px;backdrop-filter:blur(6px);}
        .ctas{margin-top:26px;display:flex;gap:12px;align-items:center}
        .btn{padding:12px 18px;border-radius:10px;font-weight:700;text-decoration:none}
        .btn-primary{background:linear-gradient(90deg,var(--accent),#7c3aed);color:#021619}
        .btn-ghost{border:1px solid rgba(255,255,255,0.06);color:var(--muted);background:transparent}
        .right{width:480px;flex:0 0 480px}
        .panel{border-radius:16px;padding:18px;background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));border:1px solid rgba(255,255,255,0.03);box-shadow: 0 20px 50px rgba(2,6,23,0.7);overflow:hidden}
        .screenshot{width:100%;height:360px;border-radius:12px;background:linear-gradient(135deg,#051117,#0b1220);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
        .orb{position:absolute;right:18%;top:30%;width:180px;height:180px;border-radius:999px;background:radial-gradient(circle at 30% 30%, rgba(34,211,201,0.34), rgba(34,211,201,0.12) 40%, transparent 60%);box-shadow:0 14px 50px rgba(34,211,201,0.12);filter:blur(8px);}
        .glow-ring{position:absolute;left:12%;bottom:18%;width:120px;height:120px;border-radius:999px;border:3px solid rgba(124,58,237,0.12);box-shadow:0 0 40px rgba(124,58,237,0.12);animation:spin 14s linear infinite}
        @keyframes float{0%{transform:translateY(0)}50%{transform:translateY(-14px)}100%{transform:translateY(0)}}
        @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        .screenshot-inner{position:relative;z-index:2;color:#e6fbf9;font-weight:700}
        .live-dot{width:10px;height:10px;border-radius:999px;background:linear-gradient(90deg,#ff4d6d,#ff7a59);box-shadow:0 6px 24px rgba(255,77,109,0.18);display:inline-block;margin-right:8px;vertical-align:middle;animation:blink 1.6s infinite}
        @keyframes blink{0%{opacity:1}50%{opacity:0.3}100%{opacity:1}}
        .section{margin-top:56px}
        .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        .card{background:linear-gradient(180deg, rgba(255,255,255,0.015), rgba(255,255,255,0.01));padding:18px;border-radius:12px;border:1px solid rgba(255,255,255,0.03)}
        footer{margin-top:64px;padding:40px 0;color:#8aa0a7;text-align:center;font-size:14px}
        @media (max-width:920px){.hero{flex-direction:column-reverse}.right{width:100%;flex:unset}.grid3{grid-template-columns:1fr}.features{grid-template-columns:1fr}}
      `}</style>

      <div className="container">
        <div className="hero">
          <div className="left">
            <span className="kicker">New — Version Intelligence</span>
            <h1>PulseDock — Unified uptime & update intelligence</h1>
            <p className="lead">Track versions, summarize changes, and publish status pages with a secure, delightful experience. Designed for teams who value clarity and control.</p>

            <div className="features">
              <div className="feature"><strong>Realtime monitoring</strong><div style={{marginTop:8,color:'#9fb1bc'}}>Live status, history and alerts across fleets.</div></div>
              <div className="feature"><strong>Changelog summaries</strong><div style={{marginTop:8,color:'#9fb1bc'}}>Short, readable release notes powered by smart summarization.</div></div>
              <div className="feature"><strong>Publish status pages</strong><div style={{marginTop:8,color:'#9fb1bc'}}>Share uptime and version history with stakeholders.</div></div>
              <div className="feature"><strong>Enterprise controls</strong><div style={{marginTop:8,color:'#9fb1bc'}}>RBAC, audit logs and SSO integrations.</div></div>
            </div>

            <div className="ctas">
              <Link href="/login"><a className="btn btn-primary">Get started — Sign in</a></Link>
              <Link href="/projects/PulseDock/docs/START.md"><a className="btn btn-ghost">Read docs</a></Link>
            </div>
          </div>

          <div className="right">
            <div className="panel">
              <div className="screenshot">
                <div className="orb" />
                <div className="glow-ring" />
                <motion.div initial={{opacity:0,y:8}} animate={controls} className="screenshot-inner">
                  <span className="live-dot" />Live overview • <strong style={{color:'#fff'}}>Demo data</strong>
                </motion.div>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:12}}>
                <div style={{fontWeight:700}}>Overview</div>
                <div style={{color:'#94a3b8'}}>Updated now</div>
              </div>
            </div>
          </div>
        </div>

        <div className="section">
          <h2>Built for scale, loved by teams</h2>
          <p style={{color:'#9fb1bc'}}>Fast setup, secure defaults, and integrations that matter — ship with confidence.</p>

          <div className="grid3" style={{marginTop:18}}>
            <div className="card"><h4>Integrations</h4><p style={{color:'#9fb1bc'}}>Connect CI, registries, and notifications.</p></div>
            <div className="card"><h4>Privacy</h4><p style={{color:'#9fb1bc'}}>Self-host or cloud; data stays yours.</p></div>
            <div className="card"><h4>Extensible</h4><p style={{color:'#9fb1bc'}}>Plugins and SDKs for custom monitors.</p></div>
          </div>
        </div>

        <div className="section">
          <h3>Start in minutes</h3>
          <ol style={{color:'#9fb1bc'}}>
            <li>docker compose up -d postgres redis</li>
            <li>npx prisma migrate deploy --schema=projects/PulseDock/prisma/schema.prisma</li>
            <li>npm run start:api && npm run start:web</li>
          </ol>
        </div>

        <footer>© {new Date().getFullYear()} PulseDock — built with care.</footer>
      </div>
    </main>
  );
}
