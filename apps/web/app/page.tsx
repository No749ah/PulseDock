import Link from "next/link";

export default function Landing() {
  return (
    <main style={{ maxWidth: 1200, width: '100%', margin: '0 auto', padding: 'clamp(12px, 3vw, 24px)' }}>
      <Card withBorder radius="xl" p="xl" mb="md" style={{ background: 'rgba(14,20,40,0.75)', backdropFilter: 'blur(10px)' }}>
        <Stack gap="md">
          <Group>
            <Badge color="indigo" variant="light">PulseDock Enterprise</Badge>
            <Badge color="cyan" variant="light">NestJS + Next.js</Badge>
          </Group>
          <Title order={1} style={{ fontSize: 'clamp(2rem, 6vw, 3.25rem)', lineHeight: 1.05, letterSpacing: '-0.03em' }}>
            Unified uptime + update intelligence for modern operations teams.
          </Title>
          <Text c="dimmed" maw={900}>
            Track websites, release freshness, and container updates. Route alerts to Discord, Slack,
            Telegram, webhooks, and email — with public status visibility and role-based admin control.
          </Text>
          <Group>
            <Button color="teal" size="md" onClick={() => router.push('/login')}>Get Started</Button>
            <Button color="teal" variant="light" size="md" onClick={() => router.push('/dashboard')}>Open Dashboard</Button>
          </Group>
        </Stack>
      </Card>

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
                <div className="screenshot-inner">Live overview • Demo data</div>
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
