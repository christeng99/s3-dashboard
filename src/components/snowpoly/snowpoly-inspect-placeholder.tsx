'use client';

import { Card } from '@/components/ui/card';

export function SnowpolyInspectPlaceholder({ title }: { title: string }) {
  return (
    <Card className="max-w-5xl p-6">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
    </Card>
  );
}
