import { Label, RadioGroup, RadioGroupItem } from '@productmap/ui';

export const Default = () => (
  <RadioGroup defaultValue="team" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <RadioGroupItem value="solo" id="plan-solo" />
      <Label htmlFor="plan-solo">Solo</Label>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <RadioGroupItem value="team" id="plan-team" />
      <Label htmlFor="plan-team">Team</Label>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <RadioGroupItem value="enterprise" id="plan-enterprise" />
      <Label htmlFor="plan-enterprise">Enterprise</Label>
    </div>
  </RadioGroup>
);
