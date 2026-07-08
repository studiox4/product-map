import { Skeleton } from '@productmap/ui';

export const CardLoading = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 260 }}>
    <Skeleton style={{ height: 20, width: '70%' }} />
    <Skeleton style={{ height: 14, width: '100%' }} />
    <Skeleton style={{ height: 14, width: '90%' }} />
  </div>
);
