export default function LandingPage() {
  return (
    <main style={{padding: 40, fontFamily: 'Inter, system-ui, sans-serif'}}>
      <section style={{maxWidth: 960, margin: '0 auto'}}>
        <h1 style={{fontSize: 48, marginBottom: 12}}>PulseDock — Version intelligence, simplified</h1>
        <p style={{fontSize: 18, color: '#444'}}>A fast, opinionated dashboard to track software versions, updates and changelogs across your fleet.</p>

        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 28}}>
          <div style={{padding: 20, borderRadius: 8, background: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.05)'}}>
            <h3>Monitor</h3>
            <p>Keep an eye on versions and get alerted on changes.</p>
          </div>
          <div style={{padding: 20, borderRadius: 8, background: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.05)'}}>
            <h3>Discover</h3>
            <p>Autodiscover versions and summarize changes automatically.</p>
          </div>
          <div style={{padding: 20, borderRadius: 8, background: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.05)'}}>
            <h3>Publish</h3>
            <p>Share public status pages and version reports.</p>
          </div>
        </div>

        <div style={{marginTop: 36}}>
          <a href="/login" style={{display: 'inline-block', padding: '12px 20px', background: '#111', color: '#fff', borderRadius: 8, textDecoration: 'none'}}>Get started — sign in</a>
        </div>
      </section>
    </main>
  )
}
