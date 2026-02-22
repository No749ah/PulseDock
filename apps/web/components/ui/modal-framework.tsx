'use client';

import { Button, Group, Modal, Text } from '@mantine/core';
import type { ModalProps } from '@mantine/core';
import type { ReactNode } from 'react';

export function AppModal(props: ModalProps) {
  return <Modal centered radius="md" {...props} />;
}

export function ConfirmModal({
  opened,
  onClose,
  title,
  message,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor = 'red',
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  message: ReactNode;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
}) {
  const mobile = useMediaQuery('(max-width: 48em)');

  return (
    <AppModal opened={opened} onClose={onClose} title={title}>
      <Text size="sm">{message}</Text>
      <Group mt="md" justify="flex-end" grow={mobile}>
        <Button variant="default" onClick={onClose} fullWidth={mobile}>{cancelLabel}</Button>
        <Button color={confirmColor} onClick={onConfirm} fullWidth={mobile}>{confirmLabel}</Button>
      </Group>
    </AppModal>
  );
}
