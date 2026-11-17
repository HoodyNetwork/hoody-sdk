// The old /market route reads nothing: one empty state (both fixture contracts need a named default).
import { defineFixtures } from '@app/fixtures';

export default defineFixtures({ default: 'default', states: { default: {} } });
