/** Every event type the server declares, in catalog order. */
export declare const EVENT_TYPES: readonly ["account.updated", "activity.logged", "auth.token.created", "auth.token.deleted", "auth.token.disabled", "auth.token.enabled", "auth.token.updated", "billing.balance_changed", "billing.invoice.created", "billing.payment_method.added", "billing.payment_method.default_changed", "billing.payment_method.removed", "billing.payment_method.updated", "billing.payment.failed", "billing.payment.succeeded", "billing.payment.updated", "computer.access_restored", "computer.access_suspended", "computer.autostart_disabled", "computer.autostart_enabled", "computer.copying", "computer.creating", "computer.deleted", "computer.deleting", "computer.display.enabled", "computer.env.applied", "computer.env.failed", "computer.env.updated", "computer.failed", "computer.network.created", "computer.network.deleted", "computer.network.failed", "computer.network.running", "computer.network.stopped", "computer.network.updated", "computer.operation.completed", "computer.operation.failed", "computer.paused", "computer.renamed", "computer.resource_updated", "computer.running", "computer.snapshot.created", "computer.snapshot.deleted", "computer.snapshot.renamed", "computer.snapshot.restored", "computer.ssh_key.added", "computer.ssh_key.removed", "computer.stopped", "computer.updated", "firewall.rule.added", "firewall.rule.disabled", "firewall.rule.enabled", "firewall.rule.removed", "firewall.rule.updated", "image.library.added", "notification.created", "notification.deleted", "notification.read", "notification.updated", "pool.created", "pool.deleted", "pool.invitation_revoked", "pool.invited", "pool.member.joined", "pool.member.left", "pool.member.role_changed", "pool.updated", "project.created", "project.deleted", "project.permission.granted", "project.permission.revoked", "project.permission.updated", "project.updated", "proxy.alias.created", "proxy.alias.deleted", "proxy.alias.disabled", "proxy.alias.enabled", "proxy.alias.expired", "proxy.alias.expiring_soon", "proxy.alias.updated", "proxy.permissions.default_changed", "proxy.permissions.group_added", "proxy.permissions.group_removed", "proxy.permissions.group_updated", "proxy.permissions.updated", "server.command.completed", "server.command.failed", "server.created", "server.deleted", "server.disabled", "server.enabled", "server.health_changed", "server.offer.published", "server.offer.updated", "server.offer.withdrawn", "server.rental_expired", "server.rental_expiring", "server.rental_extended", "server.rental_hold_started", "server.rental_started", "server.rental_terminated", "server.rental_updated", "server.reservation.created", "server.reservation.fulfilled", "server.reservation.refunded", "server.updated", "storage.share.created", "storage.share.deleted", "storage.share.disabled", "storage.share.enabled", "storage.share.expired", "storage.share.expiring_soon", "storage.share.mount_changed", "storage.share.updated", "vault.cleared", "vault.key.deleted", "vault.key.set"];
/** An event type name. */
export type EventType = typeof EVENT_TYPES[number];
/** A resource type named by the catalog. */
export type ResourceType = 'account' | 'activity_log' | 'auth_token' | 'computer' | 'computer_network' | 'firewall' | 'invoice' | 'notification' | 'payment' | 'payment_method' | 'pool' | 'project' | 'project_permission' | 'proxy_alias' | 'proxy_permissions' | 'reservation' | 'server' | 'server_offer' | 'storage_share' | 'user_image' | 'vault' | 'wallet';
/** Types written to history and delivered with a cursor. */
export type PersistedEventType = 'account.updated' | 'auth.token.created' | 'auth.token.deleted' | 'auth.token.disabled' | 'auth.token.enabled' | 'auth.token.updated' | 'billing.balance_changed' | 'billing.invoice.created' | 'billing.payment_method.added' | 'billing.payment_method.default_changed' | 'billing.payment_method.removed' | 'billing.payment_method.updated' | 'billing.payment.failed' | 'billing.payment.succeeded' | 'billing.payment.updated' | 'computer.access_restored' | 'computer.access_suspended' | 'computer.autostart_disabled' | 'computer.autostart_enabled' | 'computer.copying' | 'computer.creating' | 'computer.deleted' | 'computer.deleting' | 'computer.display.enabled' | 'computer.env.applied' | 'computer.env.failed' | 'computer.env.updated' | 'computer.failed' | 'computer.network.created' | 'computer.network.deleted' | 'computer.network.failed' | 'computer.network.running' | 'computer.network.stopped' | 'computer.network.updated' | 'computer.operation.completed' | 'computer.operation.failed' | 'computer.paused' | 'computer.renamed' | 'computer.resource_updated' | 'computer.running' | 'computer.snapshot.created' | 'computer.snapshot.deleted' | 'computer.snapshot.renamed' | 'computer.snapshot.restored' | 'computer.ssh_key.added' | 'computer.ssh_key.removed' | 'computer.stopped' | 'computer.updated' | 'firewall.rule.added' | 'firewall.rule.disabled' | 'firewall.rule.enabled' | 'firewall.rule.removed' | 'firewall.rule.updated' | 'image.library.added' | 'notification.created' | 'notification.deleted' | 'notification.read' | 'notification.updated' | 'pool.created' | 'pool.deleted' | 'pool.invitation_revoked' | 'pool.invited' | 'pool.member.joined' | 'pool.member.left' | 'pool.member.role_changed' | 'pool.updated' | 'project.created' | 'project.deleted' | 'project.permission.granted' | 'project.permission.revoked' | 'project.permission.updated' | 'project.updated' | 'proxy.alias.created' | 'proxy.alias.deleted' | 'proxy.alias.disabled' | 'proxy.alias.enabled' | 'proxy.alias.expired' | 'proxy.alias.expiring_soon' | 'proxy.alias.updated' | 'proxy.permissions.default_changed' | 'proxy.permissions.group_added' | 'proxy.permissions.group_removed' | 'proxy.permissions.group_updated' | 'proxy.permissions.updated' | 'server.command.completed' | 'server.command.failed' | 'server.created' | 'server.deleted' | 'server.disabled' | 'server.enabled' | 'server.health_changed' | 'server.offer.published' | 'server.offer.updated' | 'server.offer.withdrawn' | 'server.rental_expired' | 'server.rental_expiring' | 'server.rental_extended' | 'server.rental_hold_started' | 'server.rental_started' | 'server.rental_terminated' | 'server.rental_updated' | 'server.reservation.created' | 'server.reservation.fulfilled' | 'server.reservation.refunded' | 'server.updated' | 'storage.share.created' | 'storage.share.deleted' | 'storage.share.disabled' | 'storage.share.enabled' | 'storage.share.expired' | 'storage.share.expiring_soon' | 'storage.share.mount_changed' | 'storage.share.updated' | 'vault.cleared' | 'vault.key.deleted' | 'vault.key.set';
/** Live-only types: `cursor: null`, `ephemeral: true`, never replayed; losing one never raises a gap. */
export type EphemeralEventType = 'activity.logged';
/** Declared names the server does not emit. */
export type ReservedEventType = 'computer.deleting' | 'computer.display.enabled' | 'firewall.rule.updated' | 'server.health_changed';
/** Per-type catalog metadata (the payload schema lives in lib/events-catalog.json). */
export interface EventCatalogInfo {
    readonly group: string;
    readonly resource_type: ResourceType;
    readonly audience: 'user' | 'global';
    readonly status: 'emitted' | 'reserved';
    readonly persisted: boolean;
    readonly realm_scoped: boolean;
    readonly variants: readonly ('full' | 'removed' | 'nameless')[];
    readonly schema_version: number;
    readonly since: string;
}
export declare const EVENT_CATALOG: {
    readonly 'account.updated': {
        readonly group: "account";
        readonly resource_type: "account";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'activity.logged': {
        readonly group: "activity";
        readonly resource_type: "activity_log";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: false;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'auth.token.created': {
        readonly group: "auth";
        readonly resource_type: "auth_token";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'auth.token.deleted': {
        readonly group: "auth";
        readonly resource_type: "auth_token";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'auth.token.disabled': {
        readonly group: "auth";
        readonly resource_type: "auth_token";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'auth.token.enabled': {
        readonly group: "auth";
        readonly resource_type: "auth_token";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'auth.token.updated': {
        readonly group: "auth";
        readonly resource_type: "auth_token";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full", "removed"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'billing.balance_changed': {
        readonly group: "billing";
        readonly resource_type: "wallet";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'billing.invoice.created': {
        readonly group: "billing";
        readonly resource_type: "invoice";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'billing.payment_method.added': {
        readonly group: "billing";
        readonly resource_type: "payment_method";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'billing.payment_method.default_changed': {
        readonly group: "billing";
        readonly resource_type: "payment_method";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'billing.payment_method.removed': {
        readonly group: "billing";
        readonly resource_type: "payment_method";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'billing.payment_method.updated': {
        readonly group: "billing";
        readonly resource_type: "payment_method";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'billing.payment.failed': {
        readonly group: "billing";
        readonly resource_type: "payment";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'billing.payment.succeeded': {
        readonly group: "billing";
        readonly resource_type: "payment";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'billing.payment.updated': {
        readonly group: "billing";
        readonly resource_type: "payment";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.access_restored': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.access_suspended': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.autostart_disabled': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.autostart_enabled': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.copying': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.creating': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.deleted': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.deleting': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "reserved";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.display.enabled': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "reserved";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.env.applied': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.env.failed': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.env.updated': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.failed': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.network.created': {
        readonly group: "computer";
        readonly resource_type: "computer_network";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full", "nameless"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.network.deleted': {
        readonly group: "computer";
        readonly resource_type: "computer_network";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full", "nameless"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.network.failed': {
        readonly group: "computer";
        readonly resource_type: "computer_network";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full", "nameless"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.network.running': {
        readonly group: "computer";
        readonly resource_type: "computer_network";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full", "nameless"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.network.stopped': {
        readonly group: "computer";
        readonly resource_type: "computer_network";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full", "nameless"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.network.updated': {
        readonly group: "computer";
        readonly resource_type: "computer_network";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full", "nameless"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.operation.completed': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.operation.failed': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.paused': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.renamed': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.resource_updated': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.running': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.snapshot.created': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.snapshot.deleted': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.snapshot.renamed': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.snapshot.restored': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.ssh_key.added': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.ssh_key.removed': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.stopped': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'computer.updated': {
        readonly group: "computer";
        readonly resource_type: "computer";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full", "removed"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'firewall.rule.added': {
        readonly group: "firewall";
        readonly resource_type: "firewall";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'firewall.rule.disabled': {
        readonly group: "firewall";
        readonly resource_type: "firewall";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'firewall.rule.enabled': {
        readonly group: "firewall";
        readonly resource_type: "firewall";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'firewall.rule.removed': {
        readonly group: "firewall";
        readonly resource_type: "firewall";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'firewall.rule.updated': {
        readonly group: "firewall";
        readonly resource_type: "firewall";
        readonly audience: "user";
        readonly status: "reserved";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'image.library.added': {
        readonly group: "image";
        readonly resource_type: "user_image";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'notification.created': {
        readonly group: "notification";
        readonly resource_type: "notification";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'notification.deleted': {
        readonly group: "notification";
        readonly resource_type: "notification";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'notification.read': {
        readonly group: "notification";
        readonly resource_type: "notification";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'notification.updated': {
        readonly group: "notification";
        readonly resource_type: "notification";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'pool.created': {
        readonly group: "pool";
        readonly resource_type: "pool";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'pool.deleted': {
        readonly group: "pool";
        readonly resource_type: "pool";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'pool.invitation_revoked': {
        readonly group: "pool";
        readonly resource_type: "pool";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'pool.invited': {
        readonly group: "pool";
        readonly resource_type: "pool";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'pool.member.joined': {
        readonly group: "pool";
        readonly resource_type: "pool";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'pool.member.left': {
        readonly group: "pool";
        readonly resource_type: "pool";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'pool.member.role_changed': {
        readonly group: "pool";
        readonly resource_type: "pool";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'pool.updated': {
        readonly group: "pool";
        readonly resource_type: "pool";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'project.created': {
        readonly group: "project";
        readonly resource_type: "project";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'project.deleted': {
        readonly group: "project";
        readonly resource_type: "project";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'project.permission.granted': {
        readonly group: "project";
        readonly resource_type: "project_permission";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'project.permission.revoked': {
        readonly group: "project";
        readonly resource_type: "project_permission";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'project.permission.updated': {
        readonly group: "project";
        readonly resource_type: "project_permission";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'project.updated': {
        readonly group: "project";
        readonly resource_type: "project";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full", "removed"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'proxy.alias.created': {
        readonly group: "proxy";
        readonly resource_type: "proxy_alias";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'proxy.alias.deleted': {
        readonly group: "proxy";
        readonly resource_type: "proxy_alias";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'proxy.alias.disabled': {
        readonly group: "proxy";
        readonly resource_type: "proxy_alias";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'proxy.alias.enabled': {
        readonly group: "proxy";
        readonly resource_type: "proxy_alias";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'proxy.alias.expired': {
        readonly group: "proxy";
        readonly resource_type: "proxy_alias";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'proxy.alias.expiring_soon': {
        readonly group: "proxy";
        readonly resource_type: "proxy_alias";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'proxy.alias.updated': {
        readonly group: "proxy";
        readonly resource_type: "proxy_alias";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full", "removed"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'proxy.permissions.default_changed': {
        readonly group: "proxy";
        readonly resource_type: "proxy_permissions";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'proxy.permissions.group_added': {
        readonly group: "proxy";
        readonly resource_type: "proxy_permissions";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'proxy.permissions.group_removed': {
        readonly group: "proxy";
        readonly resource_type: "proxy_permissions";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'proxy.permissions.group_updated': {
        readonly group: "proxy";
        readonly resource_type: "proxy_permissions";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'proxy.permissions.updated': {
        readonly group: "proxy";
        readonly resource_type: "proxy_permissions";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.command.completed': {
        readonly group: "server";
        readonly resource_type: "server";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.command.failed': {
        readonly group: "server";
        readonly resource_type: "server";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.created': {
        readonly group: "server";
        readonly resource_type: "server";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.deleted': {
        readonly group: "server";
        readonly resource_type: "server";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.disabled': {
        readonly group: "server";
        readonly resource_type: "server";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.enabled': {
        readonly group: "server";
        readonly resource_type: "server";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.health_changed': {
        readonly group: "server";
        readonly resource_type: "server";
        readonly audience: "user";
        readonly status: "reserved";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.offer.published': {
        readonly group: "server";
        readonly resource_type: "server_offer";
        readonly audience: "global";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.offer.updated': {
        readonly group: "server";
        readonly resource_type: "server_offer";
        readonly audience: "global";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.offer.withdrawn': {
        readonly group: "server";
        readonly resource_type: "server_offer";
        readonly audience: "global";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.rental_expired': {
        readonly group: "server";
        readonly resource_type: "server";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.rental_expiring': {
        readonly group: "server";
        readonly resource_type: "server";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.rental_extended': {
        readonly group: "server";
        readonly resource_type: "server";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.rental_hold_started': {
        readonly group: "server";
        readonly resource_type: "server";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.rental_started': {
        readonly group: "server";
        readonly resource_type: "server";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.rental_terminated': {
        readonly group: "server";
        readonly resource_type: "server";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.rental_updated': {
        readonly group: "server";
        readonly resource_type: "server";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.reservation.created': {
        readonly group: "server";
        readonly resource_type: "reservation";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.reservation.fulfilled': {
        readonly group: "server";
        readonly resource_type: "reservation";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.reservation.refunded': {
        readonly group: "server";
        readonly resource_type: "reservation";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: false;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'server.updated': {
        readonly group: "server";
        readonly resource_type: "server";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full", "removed"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'storage.share.created': {
        readonly group: "storage";
        readonly resource_type: "storage_share";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'storage.share.deleted': {
        readonly group: "storage";
        readonly resource_type: "storage_share";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'storage.share.disabled': {
        readonly group: "storage";
        readonly resource_type: "storage_share";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'storage.share.enabled': {
        readonly group: "storage";
        readonly resource_type: "storage_share";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'storage.share.expired': {
        readonly group: "storage";
        readonly resource_type: "storage_share";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'storage.share.expiring_soon': {
        readonly group: "storage";
        readonly resource_type: "storage_share";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'storage.share.mount_changed': {
        readonly group: "storage";
        readonly resource_type: "storage_share";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'storage.share.updated': {
        readonly group: "storage";
        readonly resource_type: "storage_share";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full", "removed"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'vault.cleared': {
        readonly group: "vault";
        readonly resource_type: "vault";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'vault.key.deleted': {
        readonly group: "vault";
        readonly resource_type: "vault";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
    readonly 'vault.key.set': {
        readonly group: "vault";
        readonly resource_type: "vault";
        readonly audience: "user";
        readonly status: "emitted";
        readonly persisted: true;
        readonly realm_scoped: true;
        readonly variants: readonly ["full"];
        readonly schema_version: 1;
        readonly since: "2026-09-27";
    };
};
/** The resource type each event type carries in `resource_type`. */
export interface EventResourceTypeMap {
    'account.updated': 'account';
    'activity.logged': 'activity_log';
    'auth.token.created': 'auth_token';
    'auth.token.deleted': 'auth_token';
    'auth.token.disabled': 'auth_token';
    'auth.token.enabled': 'auth_token';
    'auth.token.updated': 'auth_token';
    'billing.balance_changed': 'wallet';
    'billing.invoice.created': 'invoice';
    'billing.payment_method.added': 'payment_method';
    'billing.payment_method.default_changed': 'payment_method';
    'billing.payment_method.removed': 'payment_method';
    'billing.payment_method.updated': 'payment_method';
    'billing.payment.failed': 'payment';
    'billing.payment.succeeded': 'payment';
    'billing.payment.updated': 'payment';
    'computer.access_restored': 'computer';
    'computer.access_suspended': 'computer';
    'computer.autostart_disabled': 'computer';
    'computer.autostart_enabled': 'computer';
    'computer.copying': 'computer';
    'computer.creating': 'computer';
    'computer.deleted': 'computer';
    'computer.deleting': 'computer';
    'computer.display.enabled': 'computer';
    'computer.env.applied': 'computer';
    'computer.env.failed': 'computer';
    'computer.env.updated': 'computer';
    'computer.failed': 'computer';
    'computer.network.created': 'computer_network';
    'computer.network.deleted': 'computer_network';
    'computer.network.failed': 'computer_network';
    'computer.network.running': 'computer_network';
    'computer.network.stopped': 'computer_network';
    'computer.network.updated': 'computer_network';
    'computer.operation.completed': 'computer';
    'computer.operation.failed': 'computer';
    'computer.paused': 'computer';
    'computer.renamed': 'computer';
    'computer.resource_updated': 'computer';
    'computer.running': 'computer';
    'computer.snapshot.created': 'computer';
    'computer.snapshot.deleted': 'computer';
    'computer.snapshot.renamed': 'computer';
    'computer.snapshot.restored': 'computer';
    'computer.ssh_key.added': 'computer';
    'computer.ssh_key.removed': 'computer';
    'computer.stopped': 'computer';
    'computer.updated': 'computer';
    'firewall.rule.added': 'firewall';
    'firewall.rule.disabled': 'firewall';
    'firewall.rule.enabled': 'firewall';
    'firewall.rule.removed': 'firewall';
    'firewall.rule.updated': 'firewall';
    'image.library.added': 'user_image';
    'notification.created': 'notification';
    'notification.deleted': 'notification';
    'notification.read': 'notification';
    'notification.updated': 'notification';
    'pool.created': 'pool';
    'pool.deleted': 'pool';
    'pool.invitation_revoked': 'pool';
    'pool.invited': 'pool';
    'pool.member.joined': 'pool';
    'pool.member.left': 'pool';
    'pool.member.role_changed': 'pool';
    'pool.updated': 'pool';
    'project.created': 'project';
    'project.deleted': 'project';
    'project.permission.granted': 'project_permission';
    'project.permission.revoked': 'project_permission';
    'project.permission.updated': 'project_permission';
    'project.updated': 'project';
    'proxy.alias.created': 'proxy_alias';
    'proxy.alias.deleted': 'proxy_alias';
    'proxy.alias.disabled': 'proxy_alias';
    'proxy.alias.enabled': 'proxy_alias';
    'proxy.alias.expired': 'proxy_alias';
    'proxy.alias.expiring_soon': 'proxy_alias';
    'proxy.alias.updated': 'proxy_alias';
    'proxy.permissions.default_changed': 'proxy_permissions';
    'proxy.permissions.group_added': 'proxy_permissions';
    'proxy.permissions.group_removed': 'proxy_permissions';
    'proxy.permissions.group_updated': 'proxy_permissions';
    'proxy.permissions.updated': 'proxy_permissions';
    'server.command.completed': 'server';
    'server.command.failed': 'server';
    'server.created': 'server';
    'server.deleted': 'server';
    'server.disabled': 'server';
    'server.enabled': 'server';
    'server.health_changed': 'server';
    'server.offer.published': 'server_offer';
    'server.offer.updated': 'server_offer';
    'server.offer.withdrawn': 'server_offer';
    'server.rental_expired': 'server';
    'server.rental_expiring': 'server';
    'server.rental_extended': 'server';
    'server.rental_hold_started': 'server';
    'server.rental_started': 'server';
    'server.rental_terminated': 'server';
    'server.rental_updated': 'server';
    'server.reservation.created': 'reservation';
    'server.reservation.fulfilled': 'reservation';
    'server.reservation.refunded': 'reservation';
    'server.updated': 'server';
    'storage.share.created': 'storage_share';
    'storage.share.deleted': 'storage_share';
    'storage.share.disabled': 'storage_share';
    'storage.share.enabled': 'storage_share';
    'storage.share.expired': 'storage_share';
    'storage.share.expiring_soon': 'storage_share';
    'storage.share.mount_changed': 'storage_share';
    'storage.share.updated': 'storage_share';
    'vault.cleared': 'vault';
    'vault.key.deleted': 'vault';
    'vault.key.set': 'vault';
}
/** Payload of `account.updated` (schema_version 1). */
export type AccountUpdatedPayload = {
    account: {
        id: string;
    };
    changes: Array<string>;
};
/**
 * Payload of `activity.logged` (schema_version 1).
 *
 * @remarks Ephemeral: live only, opt-in, never in history.
 */
export type ActivityLoggedPayload = {
    [key: string]: unknown;
};
/** Payload of `auth.token.created` (schema_version 1). */
export type AuthTokenCreatedPayload = {
    token: {
        id: string;
        alias: string;
        prefix: string;
        public_key?: string | null;
        ip_whitelist?: Array<string>;
        realm_ids?: Array<string>;
        allow_no_realm: boolean;
        expires_at?: string | null;
        is_enabled: boolean;
        vault_access: boolean;
        event_access: boolean;
        created_by_token_id?: string | null;
        delegation_depth?: number;
        created_at: string;
        updated_at: string;
    };
};
/** Payload of `auth.token.deleted` (schema_version 1). */
export type AuthTokenDeletedPayload = {
    token: {
        id: string;
        alias: string;
        prefix: string;
        public_key?: string | null;
        ip_whitelist?: Array<string>;
        realm_ids?: Array<string>;
        allow_no_realm: boolean;
        expires_at?: string | null;
        is_enabled: boolean;
        vault_access: boolean;
        event_access: boolean;
        created_by_token_id?: string | null;
        delegation_depth?: number;
        created_at: string;
        updated_at: string;
    };
};
/** Payload of `auth.token.disabled` (schema_version 1). */
export type AuthTokenDisabledPayload = {
    token: {
        id: string;
        alias: string;
        prefix: string;
        public_key?: string | null;
        ip_whitelist?: Array<string>;
        realm_ids?: Array<string>;
        allow_no_realm: boolean;
        expires_at?: string | null;
        is_enabled: boolean;
        vault_access: boolean;
        event_access: boolean;
        created_by_token_id?: string | null;
        delegation_depth?: number;
        created_at: string;
        updated_at: string;
    };
};
/** Payload of `auth.token.enabled` (schema_version 1). */
export type AuthTokenEnabledPayload = {
    token: {
        id: string;
        alias: string;
        prefix: string;
        public_key?: string | null;
        ip_whitelist?: Array<string>;
        realm_ids?: Array<string>;
        allow_no_realm: boolean;
        expires_at?: string | null;
        is_enabled: boolean;
        vault_access: boolean;
        event_access: boolean;
        created_by_token_id?: string | null;
        delegation_depth?: number;
        created_at: string;
        updated_at: string;
    };
};
/** Payload of `auth.token.updated` (schema_version 1). */
export type AuthTokenUpdatedPayload = ({
    token: {
        id: string;
        alias: string;
        prefix: string;
        public_key?: string | null;
        ip_whitelist?: Array<string>;
        realm_ids?: Array<string>;
        allow_no_realm: boolean;
        expires_at?: string | null;
        is_enabled: boolean;
        vault_access: boolean;
        event_access: boolean;
        created_by_token_id?: string | null;
        delegation_depth?: number;
        created_at: string;
        updated_at: string;
    };
    changes: Array<"alias" | "public_key" | "public_storage" | "ip_whitelist" | "realm_ids" | "allow_no_realm" | "permissions" | "expires_at" | "vault_access" | "event_access">;
}) | ({
    token: {
        id: string;
    };
    visibility: "removed";
    changes: Array<"realm_ids">;
});
/** Payload of `billing.balance_changed` (schema_version 1). */
export type BillingBalanceChangedPayload = {
    billing: {
        wallet: "general" | "ai";
        balance_minor: number;
        delta_minor: number;
        currency: string;
        transaction_id?: string;
        reason_code: string;
    };
};
/** Payload of `billing.invoice.created` (schema_version 1). */
export type BillingInvoiceCreatedPayload = {
    invoice: {
        id: string;
        amount_minor: number;
        currency: string;
        status: string;
    };
};
/** Payload of `billing.payment_method.added` (schema_version 1). */
export type BillingPaymentMethodAddedPayload = {
    payment_method: {
        id: string;
    };
    previous_id?: string;
};
/** Payload of `billing.payment_method.default_changed` (schema_version 1). */
export type BillingPaymentMethodDefaultChangedPayload = {
    payment_method: {
        id: string;
    };
    previous_id?: string;
};
/** Payload of `billing.payment_method.removed` (schema_version 1). */
export type BillingPaymentMethodRemovedPayload = {
    payment_method: {
        id: string;
    };
    previous_id?: string;
};
/** Payload of `billing.payment_method.updated` (schema_version 1). */
export type BillingPaymentMethodUpdatedPayload = {
    payment_method: {
        id: string;
    };
    previous_id?: string;
};
/** Payload of `billing.payment.failed` (schema_version 1). */
export type BillingPaymentFailedPayload = {
    payment: {
        id: string;
        amount_minor: number;
        currency: string;
        status: string;
        failure_code?: string;
    };
};
/** Payload of `billing.payment.succeeded` (schema_version 1). */
export type BillingPaymentSucceededPayload = {
    payment: {
        id: string;
        amount_minor: number;
        currency: string;
        status: string;
        failure_code?: string;
    };
};
/** Payload of `billing.payment.updated` (schema_version 1). */
export type BillingPaymentUpdatedPayload = {
    payment: {
        id: string;
        amount_minor: number;
        currency: string;
        status: string;
        failure_code?: string;
    };
};
/** Payload of `computer.access_restored` (schema_version 1). */
export type ComputerAccessRestoredPayload = {
    computer: {
        id: string;
    };
    access: {
        suspended: boolean;
        mode: string | null;
    };
    reason_code: string;
};
/** Payload of `computer.access_suspended` (schema_version 1). */
export type ComputerAccessSuspendedPayload = {
    computer: {
        id: string;
    };
    access: {
        suspended: boolean;
        mode: string | null;
    };
    reason_code: string;
};
/** Payload of `computer.autostart_disabled` (schema_version 1). */
export type ComputerAutostartDisabledPayload = {
    computer: {
        id: string;
        project_id: string;
        server_id: string | null;
        name: string | null;
        color: string | null;
        computer_image: string | null;
        status: ("creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled") | null;
        ai: boolean;
        hoody_kit: boolean;
        dev_kit: boolean;
        kvm: boolean;
        autostart: boolean;
        ramdisk: boolean;
        ramdisk_scope: "computer" | "project";
        is_default: boolean;
        comment: string | null;
        source_computer_id: string | null;
        server_expired: boolean;
        server_expired_at: string | null;
        server_expired_reason: string | null;
        created_at: string | null;
        updated_at: string | null;
    };
    reason_code?: string;
};
/** Payload of `computer.autostart_enabled` (schema_version 1). */
export type ComputerAutostartEnabledPayload = {
    computer: {
        id: string;
        project_id: string;
        server_id: string | null;
        name: string | null;
        color: string | null;
        computer_image: string | null;
        status: ("creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled") | null;
        ai: boolean;
        hoody_kit: boolean;
        dev_kit: boolean;
        kvm: boolean;
        autostart: boolean;
        ramdisk: boolean;
        ramdisk_scope: "computer" | "project";
        is_default: boolean;
        comment: string | null;
        source_computer_id: string | null;
        server_expired: boolean;
        server_expired_at: string | null;
        server_expired_reason: string | null;
        created_at: string | null;
        updated_at: string | null;
    };
    reason_code?: string;
};
/** Payload of `computer.copying` (schema_version 1). */
export type ComputerCopyingPayload = {
    computer: {
        id: string;
        status: "creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled";
    };
    previous: {
        status: ("creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled") | null;
    };
};
/** Payload of `computer.creating` (schema_version 1). */
export type ComputerCreatingPayload = {
    computer: {
        id: string;
        project_id: string;
        server_id: string | null;
        name: string | null;
        color: string | null;
        computer_image: string | null;
        status: ("creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled") | null;
        ai: boolean;
        hoody_kit: boolean;
        dev_kit: boolean;
        kvm: boolean;
        autostart: boolean;
        ramdisk: boolean;
        ramdisk_scope: "computer" | "project";
        is_default: boolean;
        comment: string | null;
        source_computer_id: string | null;
        server_expired: boolean;
        server_expired_at: string | null;
        server_expired_reason: string | null;
        created_at: string | null;
        updated_at: string | null;
    };
    reason_code?: string;
};
/** Payload of `computer.deleted` (schema_version 1). */
export type ComputerDeletedPayload = {
    computer: {
        id: string;
        project_id: string;
        server_id: string | null;
        name: string | null;
        color: string | null;
        computer_image: string | null;
        status: ("creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled") | null;
        ai: boolean;
        hoody_kit: boolean;
        dev_kit: boolean;
        kvm: boolean;
        autostart: boolean;
        ramdisk: boolean;
        ramdisk_scope: "computer" | "project";
        is_default: boolean;
        comment: string | null;
        source_computer_id: string | null;
        server_expired: boolean;
        server_expired_at: string | null;
        server_expired_reason: string | null;
        created_at: string | null;
        updated_at: string | null;
    };
    reason_code?: string;
};
/**
 * Payload of `computer.deleting` (schema_version 1).
 *
 * @remarks Reserved: declared but not emitted by the server.
 */
export type ComputerDeletingPayload = {
    [key: string]: unknown;
};
/**
 * Payload of `computer.display.enabled` (schema_version 1).
 *
 * @remarks Reserved: declared but not emitted by the server.
 */
export type ComputerDisplayEnabledPayload = {
    [key: string]: unknown;
};
/** Payload of `computer.env.applied` (schema_version 1). */
export type ComputerEnvAppliedPayload = {
    computer: {
        id: string;
    };
    env: {
        revision: number;
        applied_revision: number;
    };
    keys?: Array<string>;
    reason_code?: string;
};
/** Payload of `computer.env.failed` (schema_version 1). */
export type ComputerEnvFailedPayload = {
    computer: {
        id: string;
    };
    env: {
        revision: number;
        applied_revision: number;
    };
    keys?: Array<string>;
    reason_code?: string;
};
/** Payload of `computer.env.updated` (schema_version 1). */
export type ComputerEnvUpdatedPayload = {
    computer: {
        id: string;
    };
    env: {
        revision: number;
        applied_revision: number;
    };
    keys?: Array<string>;
    reason_code?: string;
};
/** Payload of `computer.failed` (schema_version 1). */
export type ComputerFailedPayload = {
    computer: {
        id: string;
        project_id: string;
        server_id: string | null;
        name: string | null;
        color: string | null;
        computer_image: string | null;
        status: ("creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled") | null;
        ai: boolean;
        hoody_kit: boolean;
        dev_kit: boolean;
        kvm: boolean;
        autostart: boolean;
        ramdisk: boolean;
        ramdisk_scope: "computer" | "project";
        is_default: boolean;
        comment: string | null;
        source_computer_id: string | null;
        server_expired: boolean;
        server_expired_at: string | null;
        server_expired_reason: string | null;
        created_at: string | null;
        updated_at: string | null;
    };
    previous_status: ("creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled") | null;
    current_status: "creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled";
    reason?: string;
    operation_id?: string;
};
/** Payload of `computer.network.created` (schema_version 1). */
export type ComputerNetworkCreatedPayload = ({
    computer: {
        id: string;
    };
    network: {
        id: string;
        type: string | null;
        status: string | null;
        credentials_configured?: boolean;
    };
    changes?: Array<string>;
    reason_code?: string;
}) | ({
    computer: {
        id: string;
    };
    network: {
        id: string;
        type: string | null;
        status: string | null;
    };
    changes?: Array<string>;
    reason_code?: string;
});
/** Payload of `computer.network.deleted` (schema_version 1). */
export type ComputerNetworkDeletedPayload = ({
    computer: {
        id: string;
    };
    network: {
        id: string;
        type: string | null;
        status: string | null;
        credentials_configured?: boolean;
    };
    changes?: Array<string>;
    reason_code?: string;
}) | ({
    computer: {
        id: string;
    };
    network: {
        id: string;
        type: string | null;
        status: string | null;
    };
    changes?: Array<string>;
    reason_code?: string;
});
/** Payload of `computer.network.failed` (schema_version 1). */
export type ComputerNetworkFailedPayload = ({
    computer: {
        id: string;
    };
    network: {
        id: string;
        type: string | null;
        status: string | null;
        credentials_configured?: boolean;
    };
    changes?: Array<string>;
    reason_code?: string;
}) | ({
    computer: {
        id: string;
    };
    network: {
        id: string;
        type: string | null;
        status: string | null;
    };
    changes?: Array<string>;
    reason_code?: string;
});
/** Payload of `computer.network.running` (schema_version 1). */
export type ComputerNetworkRunningPayload = ({
    computer: {
        id: string;
    };
    network: {
        id: string;
        type: string | null;
        status: string | null;
        credentials_configured?: boolean;
    };
    changes?: Array<string>;
    reason_code?: string;
}) | ({
    computer: {
        id: string;
    };
    network: {
        id: string;
        type: string | null;
        status: string | null;
    };
    changes?: Array<string>;
    reason_code?: string;
});
/** Payload of `computer.network.stopped` (schema_version 1). */
export type ComputerNetworkStoppedPayload = ({
    computer: {
        id: string;
    };
    network: {
        id: string;
        type: string | null;
        status: string | null;
        credentials_configured?: boolean;
    };
    changes?: Array<string>;
    reason_code?: string;
}) | ({
    computer: {
        id: string;
    };
    network: {
        id: string;
        type: string | null;
        status: string | null;
    };
    changes?: Array<string>;
    reason_code?: string;
});
/** Payload of `computer.network.updated` (schema_version 1). */
export type ComputerNetworkUpdatedPayload = ({
    computer: {
        id: string;
    };
    network: {
        id: string;
        type: string | null;
        status: string | null;
        credentials_configured?: boolean;
    };
    changes?: Array<string>;
    reason_code?: string;
}) | ({
    computer: {
        id: string;
    };
    network: {
        id: string;
        type: string | null;
        status: string | null;
    };
    changes?: Array<string>;
    reason_code?: string;
});
/** Payload of `computer.operation.completed` (schema_version 1). */
export type ComputerOperationCompletedPayload = {
    computer: {
        id: string;
    };
    operation: {
        id: string;
        kind: string;
        status: "completed" | "failed" | "terminated" | "timeout";
        exit_code: number | null;
        reason_code?: "nonzero_exit" | "failed" | "terminated" | "timeout";
        supersedes?: "completed" | "failed" | "terminated" | "timeout";
    };
};
/** Payload of `computer.operation.failed` (schema_version 1). */
export type ComputerOperationFailedPayload = {
    computer: {
        id: string;
    };
    operation: {
        id: string;
        kind: string;
        status: "completed" | "failed" | "terminated" | "timeout";
        exit_code: number | null;
        reason_code?: "nonzero_exit" | "failed" | "terminated" | "timeout";
        supersedes?: "completed" | "failed" | "terminated" | "timeout";
    };
};
/** Payload of `computer.paused` (schema_version 1). */
export type ComputerPausedPayload = {
    computer: {
        id: string;
        status: "creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled";
    };
    previous: {
        status: ("creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled") | null;
    };
};
/** Payload of `computer.renamed` (schema_version 1). */
export type ComputerRenamedPayload = {
    computer: {
        id: string;
        project_id: string;
        server_id: string | null;
        name: string | null;
        color: string | null;
        computer_image: string | null;
        status: ("creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled") | null;
        ai: boolean;
        hoody_kit: boolean;
        dev_kit: boolean;
        kvm: boolean;
        autostart: boolean;
        ramdisk: boolean;
        ramdisk_scope: "computer" | "project";
        is_default: boolean;
        comment: string | null;
        source_computer_id: string | null;
        server_expired: boolean;
        server_expired_at: string | null;
        server_expired_reason: string | null;
        created_at: string | null;
        updated_at: string | null;
    };
    previous: {
        name: string | null;
    };
    reason_code?: string;
};
/** Payload of `computer.resource_updated` (schema_version 1). */
export type ComputerResourceUpdatedPayload = {
    computer: {
        id: string;
        project_id: string;
        server_id: string | null;
        name: string | null;
        color: string | null;
        computer_image: string | null;
        status: ("creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled") | null;
        ai: boolean;
        hoody_kit: boolean;
        dev_kit: boolean;
        kvm: boolean;
        autostart: boolean;
        ramdisk: boolean;
        ramdisk_scope: "computer" | "project";
        is_default: boolean;
        comment: string | null;
        source_computer_id: string | null;
        server_expired: boolean;
        server_expired_at: string | null;
        server_expired_reason: string | null;
        created_at: string | null;
        updated_at: string | null;
    };
    changes: Array<"kvm" | "ramdisk" | "ramdisk_scope">;
    reason_code?: string;
};
/** Payload of `computer.running` (schema_version 1). */
export type ComputerRunningPayload = {
    computer: {
        id: string;
        project_id: string;
        server_id: string | null;
        name: string | null;
        color: string | null;
        computer_image: string | null;
        status: ("creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled") | null;
        ai: boolean;
        hoody_kit: boolean;
        dev_kit: boolean;
        kvm: boolean;
        autostart: boolean;
        ramdisk: boolean;
        ramdisk_scope: "computer" | "project";
        is_default: boolean;
        comment: string | null;
        source_computer_id: string | null;
        server_expired: boolean;
        server_expired_at: string | null;
        server_expired_reason: string | null;
        created_at: string | null;
        updated_at: string | null;
    };
    previous_status: ("creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled") | null;
    current_status: "creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled";
    reason?: string;
    operation_id?: string;
};
/** Payload of `computer.snapshot.created` (schema_version 1). */
export type ComputerSnapshotCreatedPayload = {
    computer: {
        id: string;
    };
    snapshot: {
        name: string;
        alias: string | null;
        created_at?: string | null;
    };
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
};
/** Payload of `computer.snapshot.deleted` (schema_version 1). */
export type ComputerSnapshotDeletedPayload = {
    computer: {
        id: string;
    };
    snapshot: {
        name: string;
        alias: string | null;
        created_at?: string | null;
    };
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
};
/** Payload of `computer.snapshot.renamed` (schema_version 1). */
export type ComputerSnapshotRenamedPayload = {
    computer: {
        id: string;
    };
    snapshot: {
        name: string;
        alias: string | null;
        created_at?: string | null;
    };
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
};
/** Payload of `computer.snapshot.restored` (schema_version 1). */
export type ComputerSnapshotRestoredPayload = {
    computer: {
        id: string;
    };
    snapshot: {
        name: string;
        alias: string | null;
        created_at?: string | null;
    };
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
};
/** Payload of `computer.ssh_key.added` (schema_version 1). */
export type ComputerSshKeyAddedPayload = {
    computer: {
        id: string;
    };
    ssh_key: {
        fingerprint: string | null;
        label: string | null;
    };
};
/** Payload of `computer.ssh_key.removed` (schema_version 1). */
export type ComputerSshKeyRemovedPayload = {
    computer: {
        id: string;
    };
    ssh_key: {
        fingerprint: string | null;
        label: string | null;
    };
};
/** Payload of `computer.stopped` (schema_version 1). */
export type ComputerStoppedPayload = {
    computer: {
        id: string;
        project_id: string;
        server_id: string | null;
        name: string | null;
        color: string | null;
        computer_image: string | null;
        status: ("creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled") | null;
        ai: boolean;
        hoody_kit: boolean;
        dev_kit: boolean;
        kvm: boolean;
        autostart: boolean;
        ramdisk: boolean;
        ramdisk_scope: "computer" | "project";
        is_default: boolean;
        comment: string | null;
        source_computer_id: string | null;
        server_expired: boolean;
        server_expired_at: string | null;
        server_expired_reason: string | null;
        created_at: string | null;
        updated_at: string | null;
    };
    previous_status: ("creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled") | null;
    current_status: "creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled";
    reason?: string;
    operation_id?: string;
};
/** Payload of `computer.updated` (schema_version 1). */
export type ComputerUpdatedPayload = ({
    computer: {
        id: string;
        project_id: string;
        server_id: string | null;
        name: string | null;
        color: string | null;
        computer_image: string | null;
        status: ("creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming" | "host_reinstalled") | null;
        ai: boolean;
        hoody_kit: boolean;
        dev_kit: boolean;
        kvm: boolean;
        autostart: boolean;
        ramdisk: boolean;
        ramdisk_scope: "computer" | "project";
        is_default: boolean;
        comment: string | null;
        source_computer_id: string | null;
        server_expired: boolean;
        server_expired_at: string | null;
        server_expired_reason: string | null;
        created_at: string | null;
        updated_at: string | null;
    };
    changes: Array<"ai" | "comment" | "color" | "hoody_kit" | "dev_kit" | "server_expired" | "server_expired_at" | "server_expired_reason" | "realm_ids">;
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
}) | ({
    computer: {
        id: string;
    };
    visibility: "removed";
    changes: Array<"realm_ids">;
});
/** Payload of `firewall.rule.added` (schema_version 1). */
export type FirewallRuleAddedPayload = {
    computer: {
        id: string;
    };
    rule: {
        direction: "ingress" | "egress";
        action?: string;
        protocol?: string;
        description?: string;
        destination_port?: string;
        source?: string;
        destination?: string;
        source_port?: string;
        state?: string;
        icmp_type?: string;
        icmp_code?: string;
    };
};
/** Payload of `firewall.rule.disabled` (schema_version 1). */
export type FirewallRuleDisabledPayload = {
    computer: {
        id: string;
    };
    rule: {
        direction: "ingress" | "egress";
        action?: string;
        protocol?: string;
        description?: string;
        destination_port?: string;
        source?: string;
        destination?: string;
        source_port?: string;
        state?: string;
        icmp_type?: string;
        icmp_code?: string;
    };
};
/** Payload of `firewall.rule.enabled` (schema_version 1). */
export type FirewallRuleEnabledPayload = {
    computer: {
        id: string;
    };
    rule: {
        direction: "ingress" | "egress";
        action?: string;
        protocol?: string;
        description?: string;
        destination_port?: string;
        source?: string;
        destination?: string;
        source_port?: string;
        state?: string;
        icmp_type?: string;
        icmp_code?: string;
    };
};
/** Payload of `firewall.rule.removed` (schema_version 1). */
export type FirewallRuleRemovedPayload = {
    computer: {
        id: string;
    };
    rule: {
        direction: "ingress" | "egress";
        action?: string;
        protocol?: string;
        description?: string;
        destination_port?: string;
        source?: string;
        destination?: string;
        source_port?: string;
        state?: string;
        icmp_type?: string;
        icmp_code?: string;
    };
};
/**
 * Payload of `firewall.rule.updated` (schema_version 1).
 *
 * @remarks Reserved: declared but not emitted by the server.
 */
export type FirewallRuleUpdatedPayload = {
    [key: string]: unknown;
};
/** Payload of `image.library.added` (schema_version 1). */
export type ImageLibraryAddedPayload = {
    image: {
        id: string;
        alias: string;
    };
    source: "import" | "purchase";
};
/** Payload of `notification.created` (schema_version 1). */
export type NotificationCreatedPayload = {
    notification: {
        id: string;
        title: string;
        message: string;
        truncated?: true;
        type: string;
        severity: string;
        is_public: boolean;
        is_global: boolean;
        expires_at: string | null;
        created_at: string;
        updated_at: string;
    };
};
/** Payload of `notification.deleted` (schema_version 1). */
export type NotificationDeletedPayload = {
    notification: {
        id: string;
    };
    reason_code?: "retargeted";
};
/** Payload of `notification.read` (schema_version 1). */
export type NotificationReadPayload = ({
    notification: {
        id: string;
        is_read: true;
        read_at: string;
    };
}) | ({
    all: true;
    count: number;
});
/** Payload of `notification.updated` (schema_version 1). */
export type NotificationUpdatedPayload = {
    notification: {
        id: string;
        title: string;
        message: string;
        truncated?: true;
        type: string;
        severity: string;
        is_public: boolean;
        is_global: boolean;
        expires_at: string | null;
        created_at: string;
        updated_at: string;
    };
    changes: Array<"title" | "message" | "type" | "severity" | "is_public" | "expires_at">;
};
/** Payload of `pool.created` (schema_version 1). */
export type PoolCreatedPayload = {
    pool: {
        id: string;
        owner_id: string;
        name: string;
        description?: string | null;
        is_default?: boolean | null;
        created_at?: string | null;
        updated_at?: string | null;
    };
};
/** Payload of `pool.deleted` (schema_version 1). */
export type PoolDeletedPayload = {
    pool: {
        id: string;
    };
    reason_code?: string;
};
/** Payload of `pool.invitation_revoked` (schema_version 1). */
export type PoolInvitationRevokedPayload = {
    pool: {
        id: string;
    };
    member: {
        user_id: string;
        role: "owner" | "admin" | "user";
    };
    previous?: {
        role: "owner" | "admin" | "user";
    };
    reason_code?: string;
};
/** Payload of `pool.invited` (schema_version 1). */
export type PoolInvitedPayload = {
    pool: {
        id: string;
    };
    member: {
        user_id: string;
        role: "owner" | "admin" | "user";
    };
    previous?: {
        role: "owner" | "admin" | "user";
    };
    reason_code?: string;
};
/** Payload of `pool.member.joined` (schema_version 1). */
export type PoolMemberJoinedPayload = {
    pool: {
        id: string;
    };
    member: {
        user_id: string;
        role: "owner" | "admin" | "user";
    };
    previous?: {
        role: "owner" | "admin" | "user";
    };
    reason_code?: string;
};
/** Payload of `pool.member.left` (schema_version 1). */
export type PoolMemberLeftPayload = {
    pool: {
        id: string;
    };
    member: {
        user_id: string;
        role: "owner" | "admin" | "user";
    };
    previous?: {
        role: "owner" | "admin" | "user";
    };
    reason_code?: string;
};
/** Payload of `pool.member.role_changed` (schema_version 1). */
export type PoolMemberRoleChangedPayload = {
    pool: {
        id: string;
    };
    member: {
        user_id: string;
        role: "owner" | "admin" | "user";
    };
    previous?: {
        role: "owner" | "admin" | "user";
    };
    reason_code?: string;
};
/** Payload of `pool.updated` (schema_version 1). */
export type PoolUpdatedPayload = {
    pool: {
        id: string;
        owner_id: string;
        name: string;
        description?: string | null;
        is_default?: boolean | null;
        created_at?: string | null;
        updated_at?: string | null;
    };
    changes?: Array<string>;
};
/** Payload of `project.created` (schema_version 1). */
export type ProjectCreatedPayload = {
    project: {
        id: string;
        user_id: string;
        alias: string;
        color: string;
        created_at: string;
        updated_at: string;
        max_computers: number | null;
        is_default: boolean;
        realm_ids: Array<string>;
    };
};
/** Payload of `project.deleted` (schema_version 1). */
export type ProjectDeletedPayload = {
    project: {
        id: string;
        user_id: string;
        alias: string;
        color: string;
        created_at: string;
        updated_at: string;
        max_computers: number | null;
        is_default: boolean;
        realm_ids: Array<string>;
    };
};
/** Payload of `project.permission.granted` (schema_version 1). */
export type ProjectPermissionGrantedPayload = {
    project: {
        id: string;
    };
    permission: {
        id: string;
        user_id: string;
        level: ("read" | "edit" | "delete") | null;
        previous_level: ("read" | "edit" | "delete") | null;
    };
    reason_code?: "project_deleted" | "user_deleted" | "cascade";
};
/** Payload of `project.permission.revoked` (schema_version 1). */
export type ProjectPermissionRevokedPayload = {
    project: {
        id: string;
    };
    permission: {
        id: string;
        user_id: string;
        level: ("read" | "edit" | "delete") | null;
        previous_level: ("read" | "edit" | "delete") | null;
    };
    reason_code?: "project_deleted" | "user_deleted" | "cascade";
};
/** Payload of `project.permission.updated` (schema_version 1). */
export type ProjectPermissionUpdatedPayload = {
    project: {
        id: string;
    };
    permission: {
        id: string;
        user_id: string;
        level: ("read" | "edit" | "delete") | null;
        previous_level: ("read" | "edit" | "delete") | null;
    };
    reason_code?: "project_deleted" | "user_deleted" | "cascade";
};
/** Payload of `project.updated` (schema_version 1). */
export type ProjectUpdatedPayload = ({
    project: {
        id: string;
        user_id: string;
        alias: string;
        color: string;
        created_at: string;
        updated_at: string;
        max_computers: number | null;
        is_default: boolean;
        realm_ids: Array<string>;
    };
    changes: Array<"alias" | "color" | "max_computers" | "realm_ids" | "provisioning_status">;
    previous?: {
        alias?: string;
        color?: string;
        max_computers?: number | null;
    };
}) | ({
    project: {
        id: string;
    };
    visibility: "removed";
    changes: Array<"realm_ids">;
});
/** Payload of `proxy.alias.created` (schema_version 1). */
export type ProxyAliasCreatedPayload = {
    alias: {
        id: string;
        user_id?: string;
        project_id?: string;
        computer_id?: string;
        alias?: string;
        program?: string;
        index?: number;
        target_path?: string | null;
        allow_path_override?: boolean;
        expires_at?: string | null;
        enabled?: boolean;
        created_at?: string;
        updated_at?: string;
    };
    changes?: Array<string>;
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
};
/** Payload of `proxy.alias.deleted` (schema_version 1). */
export type ProxyAliasDeletedPayload = {
    alias: {
        id: string;
        user_id?: string;
        project_id?: string;
        computer_id?: string;
        alias?: string;
        program?: string;
        index?: number;
        target_path?: string | null;
        allow_path_override?: boolean;
        expires_at?: string | null;
        enabled?: boolean;
        created_at?: string;
        updated_at?: string;
    };
    changes?: Array<string>;
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
};
/** Payload of `proxy.alias.disabled` (schema_version 1). */
export type ProxyAliasDisabledPayload = {
    alias: {
        id: string;
        user_id?: string;
        project_id?: string;
        computer_id?: string;
        alias?: string;
        program?: string;
        index?: number;
        target_path?: string | null;
        allow_path_override?: boolean;
        expires_at?: string | null;
        enabled?: boolean;
        created_at?: string;
        updated_at?: string;
    };
    changes?: Array<string>;
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
};
/** Payload of `proxy.alias.enabled` (schema_version 1). */
export type ProxyAliasEnabledPayload = {
    alias: {
        id: string;
        user_id?: string;
        project_id?: string;
        computer_id?: string;
        alias?: string;
        program?: string;
        index?: number;
        target_path?: string | null;
        allow_path_override?: boolean;
        expires_at?: string | null;
        enabled?: boolean;
        created_at?: string;
        updated_at?: string;
    };
    changes?: Array<string>;
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
};
/** Payload of `proxy.alias.expired` (schema_version 1). */
export type ProxyAliasExpiredPayload = {
    alias: {
        id: string;
        user_id?: string;
        project_id?: string;
        computer_id?: string;
        alias?: string;
        program?: string;
        index?: number;
        target_path?: string | null;
        allow_path_override?: boolean;
        expires_at?: string | null;
        enabled?: boolean;
        created_at?: string;
        updated_at?: string;
    };
    changes?: Array<string>;
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
};
/** Payload of `proxy.alias.expiring_soon` (schema_version 1). */
export type ProxyAliasExpiringSoonPayload = {
    alias: {
        id: string;
        user_id?: string;
        project_id?: string;
        computer_id?: string;
        alias?: string;
        program?: string;
        index?: number;
        target_path?: string | null;
        allow_path_override?: boolean;
        expires_at?: string | null;
        enabled?: boolean;
        created_at?: string;
        updated_at?: string;
    };
    changes?: Array<string>;
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
};
/** Payload of `proxy.alias.updated` (schema_version 1). */
export type ProxyAliasUpdatedPayload = {
    alias: {
        id: string;
        user_id?: string;
        project_id?: string;
        computer_id?: string;
        alias?: string;
        program?: string;
        index?: number;
        target_path?: string | null;
        allow_path_override?: boolean;
        expires_at?: string | null;
        enabled?: boolean;
        created_at?: string;
        updated_at?: string;
    };
    changes?: Array<string>;
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
};
/** Payload of `proxy.permissions.default_changed` (schema_version 1). */
export type ProxyPermissionsDefaultChangedPayload = {
    permissions: {
        project: string | null;
        computer?: string;
        default?: "allow" | "deny" | "inherit";
        enable_proxy?: boolean;
        file_version?: number;
        etag?: string;
    };
    changes?: Array<string>;
    previous?: {
        default?: "allow" | "deny" | "inherit";
    };
    group?: {
        name: string;
    };
    hook_op?: "add" | "update" | "move" | "remove" | "clear";
    reason_code?: string;
};
/** Payload of `proxy.permissions.group_added` (schema_version 1). */
export type ProxyPermissionsGroupAddedPayload = {
    permissions: {
        project: string | null;
        computer?: string;
        default?: "allow" | "deny" | "inherit";
        enable_proxy?: boolean;
        file_version?: number;
        etag?: string;
    };
    changes?: Array<string>;
    previous?: {
        default?: "allow" | "deny" | "inherit";
    };
    group?: {
        name: string;
    };
    hook_op?: "add" | "update" | "move" | "remove" | "clear";
    reason_code?: string;
};
/** Payload of `proxy.permissions.group_removed` (schema_version 1). */
export type ProxyPermissionsGroupRemovedPayload = {
    permissions: {
        project: string | null;
        computer?: string;
        default?: "allow" | "deny" | "inherit";
        enable_proxy?: boolean;
        file_version?: number;
        etag?: string;
    };
    changes?: Array<string>;
    previous?: {
        default?: "allow" | "deny" | "inherit";
    };
    group?: {
        name: string;
    };
    hook_op?: "add" | "update" | "move" | "remove" | "clear";
    reason_code?: string;
};
/** Payload of `proxy.permissions.group_updated` (schema_version 1). */
export type ProxyPermissionsGroupUpdatedPayload = {
    permissions: {
        project: string | null;
        computer?: string;
        default?: "allow" | "deny" | "inherit";
        enable_proxy?: boolean;
        file_version?: number;
        etag?: string;
    };
    changes?: Array<string>;
    previous?: {
        default?: "allow" | "deny" | "inherit";
    };
    group?: {
        name: string;
    };
    hook_op?: "add" | "update" | "move" | "remove" | "clear";
    reason_code?: string;
};
/** Payload of `proxy.permissions.updated` (schema_version 1). */
export type ProxyPermissionsUpdatedPayload = {
    permissions: {
        project: string | null;
        computer?: string;
        default?: "allow" | "deny" | "inherit";
        enable_proxy?: boolean;
        file_version?: number;
        etag?: string;
    };
    changes?: Array<string>;
    previous?: {
        default?: "allow" | "deny" | "inherit";
    };
    group?: {
        name: string;
    };
    hook_op?: "add" | "update" | "move" | "remove" | "clear";
    reason_code?: string;
};
/** Payload of `server.command.completed` (schema_version 1). */
export type ServerCommandCompletedPayload = {
    command: {
        id: string;
        server_id: string;
        status: "completed" | "failed" | "terminated" | "timeout";
        exit_code: number | null;
        reason_code: ("nonzero_exit" | "failed" | "terminated" | "timeout") | null;
        supersedes?: "completed" | "failed" | "terminated" | "timeout";
    };
    operation_id: string;
};
/** Payload of `server.command.failed` (schema_version 1). */
export type ServerCommandFailedPayload = {
    command: {
        id: string;
        server_id: string;
        status: "completed" | "failed" | "terminated" | "timeout";
        exit_code: number | null;
        reason_code: ("nonzero_exit" | "failed" | "terminated" | "timeout") | null;
        supersedes?: "completed" | "failed" | "terminated" | "timeout";
    };
    operation_id: string;
};
/** Payload of `server.created` (schema_version 1). */
export type ServerCreatedPayload = {
    server: {
        id: string;
        name: string | null;
        rental_status: string | null;
        pool_id: string | null;
        owner_id: string | null;
        is_ready: boolean | null;
    };
};
/** Payload of `server.deleted` (schema_version 1). */
export type ServerDeletedPayload = {
    server: {
        id: string;
    };
};
/** Payload of `server.disabled` (schema_version 1). */
export type ServerDisabledPayload = {
    server: {
        id: string;
        name: string | null;
        rental_status: string | null;
        pool_id: string | null;
        owner_id: string | null;
        is_ready: boolean | null;
    };
};
/** Payload of `server.enabled` (schema_version 1). */
export type ServerEnabledPayload = {
    server: {
        id: string;
        name: string | null;
        rental_status: string | null;
        pool_id: string | null;
        owner_id: string | null;
        is_ready: boolean | null;
    };
};
/**
 * Payload of `server.health_changed` (schema_version 1).
 *
 * @remarks Reserved: declared but not emitted by the server.
 */
export type ServerHealthChangedPayload = {
    [key: string]: unknown;
};
/** Payload of `server.offer.published` (schema_version 1). */
export type ServerOfferPublishedPayload = {
    offer: {
        id: string;
        name: string;
        country: string;
        region?: string | null;
        city?: string | null;
        datacenter?: string | null;
        cpu_model?: string | null;
        cpu_cores?: number | null;
        cpu_threads?: number | null;
        ram_gb?: number | null;
        disks?: (Array<{
            count: number;
            capacity_gb: number;
            type?: string;
            interface?: string;
            model?: string;
        }>) | null;
        bandwidth_mbps?: number | null;
        traffic_tb?: number | null;
        traffic_unlimited?: boolean;
        ipv4_count?: number;
        pricing_rules?: ({
            [key: string]: number;
        }) | null;
        hold_rules?: ({
            [key: string]: number;
        }) | null;
        setup_fee_cents?: number;
        setup_fee_rules?: ({
            [key: string]: number;
        }) | null;
        delivery_hours?: number;
        setup_time_minutes?: number;
        stock?: number | null;
        list_pricing_rules?: ({
            [key: string]: number;
        }) | null;
        discount?: ({
            percent_off: number;
            label: string;
            label_locale: string;
            ends_at: string;
        }) | null;
    };
};
/** Payload of `server.offer.updated` (schema_version 1). */
export type ServerOfferUpdatedPayload = {
    offer: {
        id: string;
        name: string;
        country: string;
        region?: string | null;
        city?: string | null;
        datacenter?: string | null;
        cpu_model?: string | null;
        cpu_cores?: number | null;
        cpu_threads?: number | null;
        ram_gb?: number | null;
        disks?: (Array<{
            count: number;
            capacity_gb: number;
            type?: string;
            interface?: string;
            model?: string;
        }>) | null;
        bandwidth_mbps?: number | null;
        traffic_tb?: number | null;
        traffic_unlimited?: boolean;
        ipv4_count?: number;
        pricing_rules?: ({
            [key: string]: number;
        }) | null;
        hold_rules?: ({
            [key: string]: number;
        }) | null;
        setup_fee_cents?: number;
        setup_fee_rules?: ({
            [key: string]: number;
        }) | null;
        delivery_hours?: number;
        setup_time_minutes?: number;
        stock?: number | null;
        list_pricing_rules?: ({
            [key: string]: number;
        }) | null;
        discount?: ({
            percent_off: number;
            label: string;
            label_locale: string;
            ends_at: string;
        }) | null;
    };
    changes: Array<string>;
    purchasable: boolean;
};
/** Payload of `server.offer.withdrawn` (schema_version 1). */
export type ServerOfferWithdrawnPayload = {
    offer: {
        id: string;
        name: string;
        country: string;
        region?: string | null;
        city?: string | null;
        datacenter?: string | null;
        cpu_model?: string | null;
        cpu_cores?: number | null;
        cpu_threads?: number | null;
        ram_gb?: number | null;
        disks?: (Array<{
            count: number;
            capacity_gb: number;
            type?: string;
            interface?: string;
            model?: string;
        }>) | null;
        bandwidth_mbps?: number | null;
        traffic_tb?: number | null;
        traffic_unlimited?: boolean;
        ipv4_count?: number;
        pricing_rules?: ({
            [key: string]: number;
        }) | null;
        hold_rules?: ({
            [key: string]: number;
        }) | null;
        setup_fee_cents?: number;
        setup_fee_rules?: ({
            [key: string]: number;
        }) | null;
        delivery_hours?: number;
        setup_time_minutes?: number;
        stock?: number | null;
        list_pricing_rules?: ({
            [key: string]: number;
        }) | null;
        discount?: ({
            percent_off: number;
            label: string;
            label_locale: string;
            ends_at: string;
        }) | null;
    };
};
/** Payload of `server.rental_expired` (schema_version 1). */
export type ServerRentalExpiredPayload = {
    server: {
        id: string;
    };
    rental: {
        id: string;
        status: string | null;
        rental_end: string | null;
        hold_started_at: string | null;
        hold_ends_at: string | null;
    };
    previous?: {
        rental_end: string | null;
    };
};
/** Payload of `server.rental_expiring` (schema_version 1). */
export type ServerRentalExpiringPayload = {
    server: {
        id: string;
        name: string | null;
        rental_status: string | null;
        pool_id: string | null;
        owner_id: string | null;
        is_ready: boolean | null;
    };
    rental: {
        id: string;
        status: string | null;
        rental_end: string | null;
        hold_started_at: string | null;
        hold_ends_at: string | null;
    };
    warning: {
        deadline_kind: "rental_end" | "hold_end";
        deadline: string;
        stage_hours: number;
    };
};
/** Payload of `server.rental_extended` (schema_version 1). */
export type ServerRentalExtendedPayload = {
    server: {
        id: string;
    };
    rental: {
        id: string;
        status: string | null;
        rental_end: string | null;
        hold_started_at: string | null;
        hold_ends_at: string | null;
    };
    previous?: {
        rental_end: string | null;
    };
};
/** Payload of `server.rental_hold_started` (schema_version 1). */
export type ServerRentalHoldStartedPayload = {
    server: {
        id: string;
    };
    rental: {
        id: string;
        status: string | null;
        rental_end: string | null;
        hold_started_at: string | null;
        hold_ends_at: string | null;
    };
    previous?: {
        rental_end: string | null;
    };
};
/** Payload of `server.rental_started` (schema_version 1). */
export type ServerRentalStartedPayload = {
    server: {
        id: string;
    };
    rental: {
        id: string;
        status: string | null;
        rental_end: string | null;
        hold_started_at: string | null;
        hold_ends_at: string | null;
    };
    previous?: {
        rental_end: string | null;
    };
};
/** Payload of `server.rental_terminated` (schema_version 1). */
export type ServerRentalTerminatedPayload = {
    server: {
        id: string;
    };
    rental: {
        id: string;
        status: string | null;
        rental_end: string | null;
        hold_started_at: string | null;
        hold_ends_at: string | null;
    };
    previous?: {
        rental_end: string | null;
    };
};
/** Payload of `server.rental_updated` (schema_version 1). */
export type ServerRentalUpdatedPayload = {
    server: {
        id: string;
    };
    rental: {
        id: string;
        status: string | null;
        rental_end: string | null;
        hold_started_at: string | null;
        hold_ends_at: string | null;
    };
    changes: Array<string>;
};
/** Payload of `server.reservation.created` (schema_version 1). */
export type ServerReservationCreatedPayload = {
    reservation: {
        id: string;
        state: "pending" | "fulfilled" | "refunded";
        offer_id: string;
        server_id?: string;
        rental_id?: string;
    };
};
/** Payload of `server.reservation.fulfilled` (schema_version 1). */
export type ServerReservationFulfilledPayload = {
    reservation: {
        id: string;
        state: "pending" | "fulfilled" | "refunded";
        offer_id: string;
        server_id?: string;
        rental_id?: string;
    };
};
/** Payload of `server.reservation.refunded` (schema_version 1). */
export type ServerReservationRefundedPayload = {
    reservation: {
        id: string;
        state: "pending" | "fulfilled" | "refunded";
        offer_id: string;
        server_id?: string;
        rental_id?: string;
    };
};
/** Payload of `server.updated` (schema_version 1). */
export type ServerUpdatedPayload = ({
    server: {
        id: string;
        name: string | null;
        rental_status: string | null;
        pool_id: string | null;
        owner_id: string | null;
        is_ready: boolean | null;
    };
    changes: Array<string>;
    reason_code?: "pool_reparent" | "free_tier_claim" | "free_tier_release" | "platform_update";
}) | ({
    server: {
        id: string;
    };
    visibility: "removed";
    changes: Array<string>;
    reason_code?: "pool_reparent" | "free_tier_claim" | "free_tier_release" | "platform_update";
});
/** Payload of `storage.share.created` (schema_version 1). */
export type StorageShareCreatedPayload = {
    share: {
        id: string;
    };
    changes?: Array<string>;
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
    party?: "source" | "target";
};
/** Payload of `storage.share.deleted` (schema_version 1). */
export type StorageShareDeletedPayload = {
    share: {
        id: string;
    };
    changes?: Array<string>;
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
    party?: "source" | "target";
};
/** Payload of `storage.share.disabled` (schema_version 1). */
export type StorageShareDisabledPayload = {
    share: {
        id: string;
    };
    changes?: Array<string>;
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
    party?: "source" | "target";
};
/** Payload of `storage.share.enabled` (schema_version 1). */
export type StorageShareEnabledPayload = {
    share: {
        id: string;
    };
    changes?: Array<string>;
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
    party?: "source" | "target";
};
/** Payload of `storage.share.expired` (schema_version 1). */
export type StorageShareExpiredPayload = {
    share: {
        id: string;
    };
    changes?: Array<string>;
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
    party?: "source" | "target";
};
/** Payload of `storage.share.expiring_soon` (schema_version 1). */
export type StorageShareExpiringSoonPayload = {
    share: {
        id: string;
    };
    changes?: Array<string>;
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
    party?: "source" | "target";
};
/** Payload of `storage.share.mount_changed` (schema_version 1). */
export type StorageShareMountChangedPayload = {
    share: {
        id: string;
    };
    changes?: Array<string>;
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
    party?: "source" | "target";
    mount: {
        computer_id: string;
        mount: boolean;
    };
};
/** Payload of `storage.share.updated` (schema_version 1). */
export type StorageShareUpdatedPayload = {
    share: {
        id: string;
    };
    changes?: Array<string>;
    previous?: {
        [key: string]: unknown;
    };
    reason_code?: string;
    party?: "source" | "target";
};
/** Payload of `vault.cleared` (schema_version 1). */
export type VaultClearedPayload = {
    vault: {
        id: string;
        realm_id: "" | string;
        revision: number;
        changed_at: string;
    };
    removed_count: number;
};
/** Payload of `vault.key.deleted` (schema_version 1). */
export type VaultKeyDeletedPayload = {
    vault: {
        id: string;
        realm_id: "" | string;
        revision: number;
        changed_at: string;
    };
    key: string;
};
/** Payload of `vault.key.set` (schema_version 1). */
export type VaultKeySetPayload = {
    vault: {
        id: string;
        realm_id: "" | string;
        revision: number;
        changed_at: string;
    };
    key: string;
    created: boolean;
};
/** Event type -> payload (`data`) type. */
export interface HoodyEventMap {
    'account.updated': AccountUpdatedPayload;
    'activity.logged': ActivityLoggedPayload;
    'auth.token.created': AuthTokenCreatedPayload;
    'auth.token.deleted': AuthTokenDeletedPayload;
    'auth.token.disabled': AuthTokenDisabledPayload;
    'auth.token.enabled': AuthTokenEnabledPayload;
    'auth.token.updated': AuthTokenUpdatedPayload;
    'billing.balance_changed': BillingBalanceChangedPayload;
    'billing.invoice.created': BillingInvoiceCreatedPayload;
    'billing.payment_method.added': BillingPaymentMethodAddedPayload;
    'billing.payment_method.default_changed': BillingPaymentMethodDefaultChangedPayload;
    'billing.payment_method.removed': BillingPaymentMethodRemovedPayload;
    'billing.payment_method.updated': BillingPaymentMethodUpdatedPayload;
    'billing.payment.failed': BillingPaymentFailedPayload;
    'billing.payment.succeeded': BillingPaymentSucceededPayload;
    'billing.payment.updated': BillingPaymentUpdatedPayload;
    'computer.access_restored': ComputerAccessRestoredPayload;
    'computer.access_suspended': ComputerAccessSuspendedPayload;
    'computer.autostart_disabled': ComputerAutostartDisabledPayload;
    'computer.autostart_enabled': ComputerAutostartEnabledPayload;
    'computer.copying': ComputerCopyingPayload;
    'computer.creating': ComputerCreatingPayload;
    'computer.deleted': ComputerDeletedPayload;
    'computer.deleting': ComputerDeletingPayload;
    'computer.display.enabled': ComputerDisplayEnabledPayload;
    'computer.env.applied': ComputerEnvAppliedPayload;
    'computer.env.failed': ComputerEnvFailedPayload;
    'computer.env.updated': ComputerEnvUpdatedPayload;
    'computer.failed': ComputerFailedPayload;
    'computer.network.created': ComputerNetworkCreatedPayload;
    'computer.network.deleted': ComputerNetworkDeletedPayload;
    'computer.network.failed': ComputerNetworkFailedPayload;
    'computer.network.running': ComputerNetworkRunningPayload;
    'computer.network.stopped': ComputerNetworkStoppedPayload;
    'computer.network.updated': ComputerNetworkUpdatedPayload;
    'computer.operation.completed': ComputerOperationCompletedPayload;
    'computer.operation.failed': ComputerOperationFailedPayload;
    'computer.paused': ComputerPausedPayload;
    'computer.renamed': ComputerRenamedPayload;
    'computer.resource_updated': ComputerResourceUpdatedPayload;
    'computer.running': ComputerRunningPayload;
    'computer.snapshot.created': ComputerSnapshotCreatedPayload;
    'computer.snapshot.deleted': ComputerSnapshotDeletedPayload;
    'computer.snapshot.renamed': ComputerSnapshotRenamedPayload;
    'computer.snapshot.restored': ComputerSnapshotRestoredPayload;
    'computer.ssh_key.added': ComputerSshKeyAddedPayload;
    'computer.ssh_key.removed': ComputerSshKeyRemovedPayload;
    'computer.stopped': ComputerStoppedPayload;
    'computer.updated': ComputerUpdatedPayload;
    'firewall.rule.added': FirewallRuleAddedPayload;
    'firewall.rule.disabled': FirewallRuleDisabledPayload;
    'firewall.rule.enabled': FirewallRuleEnabledPayload;
    'firewall.rule.removed': FirewallRuleRemovedPayload;
    'firewall.rule.updated': FirewallRuleUpdatedPayload;
    'image.library.added': ImageLibraryAddedPayload;
    'notification.created': NotificationCreatedPayload;
    'notification.deleted': NotificationDeletedPayload;
    'notification.read': NotificationReadPayload;
    'notification.updated': NotificationUpdatedPayload;
    'pool.created': PoolCreatedPayload;
    'pool.deleted': PoolDeletedPayload;
    'pool.invitation_revoked': PoolInvitationRevokedPayload;
    'pool.invited': PoolInvitedPayload;
    'pool.member.joined': PoolMemberJoinedPayload;
    'pool.member.left': PoolMemberLeftPayload;
    'pool.member.role_changed': PoolMemberRoleChangedPayload;
    'pool.updated': PoolUpdatedPayload;
    'project.created': ProjectCreatedPayload;
    'project.deleted': ProjectDeletedPayload;
    'project.permission.granted': ProjectPermissionGrantedPayload;
    'project.permission.revoked': ProjectPermissionRevokedPayload;
    'project.permission.updated': ProjectPermissionUpdatedPayload;
    'project.updated': ProjectUpdatedPayload;
    'proxy.alias.created': ProxyAliasCreatedPayload;
    'proxy.alias.deleted': ProxyAliasDeletedPayload;
    'proxy.alias.disabled': ProxyAliasDisabledPayload;
    'proxy.alias.enabled': ProxyAliasEnabledPayload;
    'proxy.alias.expired': ProxyAliasExpiredPayload;
    'proxy.alias.expiring_soon': ProxyAliasExpiringSoonPayload;
    'proxy.alias.updated': ProxyAliasUpdatedPayload;
    'proxy.permissions.default_changed': ProxyPermissionsDefaultChangedPayload;
    'proxy.permissions.group_added': ProxyPermissionsGroupAddedPayload;
    'proxy.permissions.group_removed': ProxyPermissionsGroupRemovedPayload;
    'proxy.permissions.group_updated': ProxyPermissionsGroupUpdatedPayload;
    'proxy.permissions.updated': ProxyPermissionsUpdatedPayload;
    'server.command.completed': ServerCommandCompletedPayload;
    'server.command.failed': ServerCommandFailedPayload;
    'server.created': ServerCreatedPayload;
    'server.deleted': ServerDeletedPayload;
    'server.disabled': ServerDisabledPayload;
    'server.enabled': ServerEnabledPayload;
    'server.health_changed': ServerHealthChangedPayload;
    'server.offer.published': ServerOfferPublishedPayload;
    'server.offer.updated': ServerOfferUpdatedPayload;
    'server.offer.withdrawn': ServerOfferWithdrawnPayload;
    'server.rental_expired': ServerRentalExpiredPayload;
    'server.rental_expiring': ServerRentalExpiringPayload;
    'server.rental_extended': ServerRentalExtendedPayload;
    'server.rental_hold_started': ServerRentalHoldStartedPayload;
    'server.rental_started': ServerRentalStartedPayload;
    'server.rental_terminated': ServerRentalTerminatedPayload;
    'server.rental_updated': ServerRentalUpdatedPayload;
    'server.reservation.created': ServerReservationCreatedPayload;
    'server.reservation.fulfilled': ServerReservationFulfilledPayload;
    'server.reservation.refunded': ServerReservationRefundedPayload;
    'server.updated': ServerUpdatedPayload;
    'storage.share.created': StorageShareCreatedPayload;
    'storage.share.deleted': StorageShareDeletedPayload;
    'storage.share.disabled': StorageShareDisabledPayload;
    'storage.share.enabled': StorageShareEnabledPayload;
    'storage.share.expired': StorageShareExpiredPayload;
    'storage.share.expiring_soon': StorageShareExpiringSoonPayload;
    'storage.share.mount_changed': StorageShareMountChangedPayload;
    'storage.share.updated': StorageShareUpdatedPayload;
    'vault.cleared': VaultClearedPayload;
    'vault.key.deleted': VaultKeyDeletedPayload;
    'vault.key.set': VaultKeySetPayload;
}
