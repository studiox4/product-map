import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import {
  DOC_STATUSES,
  DOC_STATUS_COLORS,
  DOC_TYPES,
  DOC_TYPE_COLORS,
  DOC_TYPE_LABELS,
} from '@productmap/shared';
import DocTypeChip from './DocTypeChip';
import StatusBadge from './StatusBadge';

afterEach(cleanup);

describe('DocTypeChip', () => {
  it.each(DOC_TYPES)('renders %s with the shared chip colors', (type) => {
    const { container, getByText } = render(<DocTypeChip type={type} />);
    expect(getByText(DOC_TYPE_LABELS[type])).toBeTruthy();
    const chip = container.firstElementChild as HTMLElement;
    for (const cls of DOC_TYPE_COLORS[type].chip.split(' ')) {
      expect(chip.className).toContain(cls);
    }
  });
});

describe('StatusBadge', () => {
  it.each(DOC_STATUSES)('renders doc status %s with the shared colors', (status) => {
    const { container } = render(<StatusBadge status={status} />);
    const badge = container.firstElementChild as HTMLElement;
    for (const cls of DOC_STATUS_COLORS[status].split(' ')) {
      expect(badge.className).toContain(cls);
    }
  });

  it('still renders feature statuses', () => {
    const { getByText } = render(<StatusBadge status="in_progress" />);
    expect(getByText('In progress')).toBeTruthy();
  });
});
