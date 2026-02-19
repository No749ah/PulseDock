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
  return (
    <AppModal opened={opened} onClose={onClose} title={title}>
      <Text size="sm">{message}</Text>
      <Group mt="md" justify="flex-end">
        <Button variant="default" onClick={onClose}>{cancelLabel}</Button>
        <Button color={confirmColor} onClick={onConfirm}>{confirmLabel}</Button>
      </Group>
    </AppModal>
  );
}
