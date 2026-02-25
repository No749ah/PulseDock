'use client';

import { Center, Loader, Stack, Text } from '@mantine/core';

export function LoadingState({ label = 'Loading data...' }: { label?: string }) {
  return (
    <Center py="xl">
      <Stack align="center" gap="xs">
        <Loader color="teal" />
        <Text size="sm" c="dimmed">{label}</Text>
      </Stack>
    </Center>
  );
}
