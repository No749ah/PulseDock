'use client';

// Simplified landing component: minimal, fast, no heavy hero media
import { Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { useRouter } from 'next/navigation';

export default function LandingCinematic() {
  const router = useRouter();
  return (
    <Card withBorder radius="xl" p="xl" mb="md" style={{ background: 'transparent' }}>
      <Stack gap="md">
        <Title order={2} style={{ fontSize: 'clamp(1.25rem, 3vw, 2rem)' }}>
          World‑class checks, simple setup
        </Title>
        <Text c="dimmed" maw={800}>
          PulseDock helps you track releases, monitor uptime, and get meaningful alerts without noise.
          Powerful defaults and clear workflows help teams adopt quickly.
        </Text>
        <Group>
          <Button color="teal" size="md" onClick={() => router.push('/login')}>Get started</Button>
          <Button color="gray" variant="light" size="md" onClick={() => router.push('/dashboard')}>Open dashboard</Button>
        </Group>
      </Stack>
    </Card>
  );
}
