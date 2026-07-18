import { Badge, Group, Text } from '@mantine/core';

interface StatusBadgeProps {
  running?: boolean;
  bind?: string;
}

export function StatusBadge({ running, bind }: StatusBadgeProps) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Badge
        variant="dot"
        color={running ? 'green' : 'gray'}
        className={running ? 'fcc-status--running' : 'fcc-status--stopped'}
      >
        {running ? 'Running' : 'Stopped'}
      </Badge>
      {bind && (
        <Text size="xs" c="dimmed" ff="monospace">
          {bind}
        </Text>
      )}
    </Group>
  );
}
