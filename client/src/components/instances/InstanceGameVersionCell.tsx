import { formatInstanceGameVersion } from '../../lib/instanceUtils';

interface InstanceGameVersionCellProps {
  version: string | undefined;
  placeholder: string;
}

export function InstanceGameVersionCell({ version, placeholder }: InstanceGameVersionCellProps) {
  return <>{formatInstanceGameVersion(version, placeholder)}</>;
}
