import { Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@productmap/ui';

export const Default = () => (
  <Card style={{ maxWidth: 360 }}>
    <CardHeader>
      <CardTitle>Public intake form</CardTitle>
      <CardDescription>Collect ideas from customers without asking them to sign in.</CardDescription>
    </CardHeader>
    <CardContent>
      <p style={{ fontSize: 14, color: 'inherit' }}>
        Shared via a link, ideas land straight in your inbox for triage.
      </p>
    </CardContent>
    <CardFooter>
      <Button size="sm">Configure</Button>
    </CardFooter>
  </Card>
);

export const WithBadge = () => (
  <Card style={{ maxWidth: 360 }}>
    <CardHeader>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <CardTitle>Notifications</CardTitle>
        <Badge variant="secondary">Beta</Badge>
      </div>
      <CardDescription>In-app alerts for assignments and release publishes.</CardDescription>
    </CardHeader>
  </Card>
);
