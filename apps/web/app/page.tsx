'use client';

import { Badge, Card, Group, List, SimpleGrid, Stack, Text, Title, Button } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { LandingCinematic } from '../components/landing-cinematic';

export default function HomePage() {
  const router = useRouter();

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

      <LandingCinematic />

      <SimpleGrid cols={{ base: 1, md: 2 }} mt="md">
        <Card withBorder radius="lg">
          <Title order={3}>Core capabilities</Title>
          <List mt="sm" c="dimmed" spacing="xs">
            <List.Item>Multi-page app with dedicated workflow screens</List.Item>
            <List.Item>Role-based admin section and authorization boundaries</List.Item>
            <List.Item>Public status endpoint and shareable health board</List.Item>
            <List.Item>Traffic-light policies for warning and critical thresholds</List.Item>
          </List>
        </Card>
        <Card withBorder radius="lg">
          <Title order={3}>Build roadmap</Title>
          <List mt="sm" c="dimmed" spacing="xs">
            <List.Item>Postgres + Prisma persistence</List.Item>
            <List.Item>JWT + refresh tokens</List.Item>
            <List.Item>Public status page builder with layout blocks</List.Item>
            <List.Item>Expanded check types (DNS/TCP/SSL/content)</List.Item>
          </List>
        </Card>
      </SimpleGrid>
    </main>
  );
}
