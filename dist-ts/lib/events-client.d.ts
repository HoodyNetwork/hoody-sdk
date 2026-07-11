/**
 * Auto-Managed Events Client
 * High-level wrapper for Hoody Events API
 *
 * Provides automatic connection management - users just add listeners!
 *
 * Complete coverage: 65/65 event types (100%)
 *
 * Three subscription styles are supported:
 *
 *  1. Resource-specific listeners (onContainerEvents, onProjectEvents):
 *     Register with eventType "*" (wildcard) plus an EventFilter containing
 *     the target resourceId/resourceType. The EventsManager routes every
 *     incoming event through the wildcard bucket, and the filter narrows
 *     delivery to events matching that resource.
 *
 *  2. Lifecycle listeners (onLifecycle):
 *     Observe the WebSocket connection state itself (connected, disconnected,
 *     reconnecting, reconnected, error). These are distinct from data events
 *     and are delivered via EventsManager.addLifecycleListener, not through
 *     the data-event routing path.
 *
 *  3. Raw / typed event listeners (onContainerRunning, onAnyEvent, etc.):
 *     Each registers a listener on the exact event_type string (e.g.
 *     "container.running") or on "*" for all data events.
 */
import type { EventsService } from '../generated/api/events.service.js';
import type { EventServerMessage } from './events-types.js';
export declare class EventsClient {
    private manager;
    private baseURL;
    private getToken;
    /**
     * @param eventsService - Generated EventsService instance; used as a fallback
     *   token source if `getToken` is not provided.
     * @param baseURL - HTTP(S) base URL; the constructor replaces http(s):// with
     *   ws(s):// when constructing the WebSocket URL.
     * @param getToken - Optional token resolver. If omitted, falls back to reading
     *   `eventsService.http.config.token` (the internal generated-client token path).
     *   This fallback chain allows the events client to reuse the same auth token
     *   as the REST client without requiring the caller to wire it explicitly.
     */
    constructor(eventsService: EventsService, baseURL?: string, getToken?: () => string | null);
    /**
     * Listen for activity.logged events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onActivityLogged(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for auth.token.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onAuthTokenCreated(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for auth.token.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onAuthTokenDeleted(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for auth.token.disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onAuthTokenDisabled(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for auth.token.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onAuthTokenEnabled(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for auth.token.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onAuthTokenUpdated(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.autostart_disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerAutostartDisabled(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.autostart_enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerAutostartEnabled(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.creating events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerCreating(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerDeleted(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.deleting events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerDeleting(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.display.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerDisplayEnabled(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.failed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerFailed(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.renamed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerRenamed(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.resource_updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerResourceUpdated(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.running events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerRunning(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.snapshot.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerSnapshotCreated(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.snapshot.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerSnapshotDeleted(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.snapshot.renamed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerSnapshotRenamed(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.snapshot.restored events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerSnapshotRestored(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.ssh_key.added events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerSshKeyAdded(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.ssh_key.removed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerSshKeyRemoved(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for container.stopped events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerStopped(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for firewall.rule.added events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onFirewallRuleAdded(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for firewall.rule.disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onFirewallRuleDisabled(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for firewall.rule.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onFirewallRuleEnabled(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for firewall.rule.removed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onFirewallRuleRemoved(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for firewall.rule.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onFirewallRuleUpdated(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for notification.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onNotificationCreated(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for notification.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onNotificationDeleted(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for notification.read events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onNotificationRead(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for pool.invitation_revoked events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onPoolInvitationRevoked(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for pool.invited events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onPoolInvited(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for pool.member.joined events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onPoolMemberJoined(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for pool.member.left events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onPoolMemberLeft(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for pool.member.role_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onPoolMemberRoleChanged(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for project.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onProjectCreated(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for project.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onProjectDeleted(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for project.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onProjectUpdated(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for proxy.alias.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onProxyAliasCreated(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for proxy.alias.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onProxyAliasDeleted(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for proxy.alias.disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onProxyAliasDisabled(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for proxy.alias.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onProxyAliasEnabled(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for proxy.alias.expired events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onProxyAliasExpired(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for proxy.alias.expiring_soon events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onProxyAliasExpiringSoon(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for proxy.alias.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onProxyAliasUpdated(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for proxy.permissions.default_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onProxyPermissionsDefaultChanged(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for proxy.permissions.group_added events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onProxyPermissionsGroupAdded(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for proxy.permissions.group_removed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onProxyPermissionsGroupRemoved(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for proxy.permissions.group_updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onProxyPermissionsGroupUpdated(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for proxy.permissions.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onProxyPermissionsUpdated(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for server.health_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onServerHealthChanged(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for server.rental_expiring events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onServerRentalExpiring(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for storage.share.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onStorageShareCreated(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for storage.share.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onStorageShareDeleted(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for storage.share.disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onStorageShareDisabled(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for storage.share.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onStorageShareEnabled(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for storage.share.expired events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onStorageShareExpired(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for storage.share.expiring_soon events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onStorageShareExpiringSoon(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for storage.share.mount_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onStorageShareMountChanged(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for storage.share.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onStorageShareUpdated(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for user.banned events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onUserBanned(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for user.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onUserCreated(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for user.role_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onUserRoleChanged(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen for user.unbanned events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onUserUnbanned(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen to all events for a specific container.
     * Uses wildcard "*" event type with a filter on resourceId + resourceType.
     * @param containerId Container ID to filter events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onContainerEvents(containerId: string, callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen to all events for a specific project
     * @param projectId Project ID to filter events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onProjectEvents(projectId: string, callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Listen to ALL events (no filtering)
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    onAnyEvent(callback: (event: EventServerMessage) => void): Promise<() => void>;
    /**
     * Subscribe to multiple event types at once.
     *
     * Each handler is registered sequentially (awaited one at a time) so that
     * all subscriptions coalesce on the same WebSocket connection promise.
     * The first registration triggers the connect; subsequent registrations
     * await the same in-flight connectionPromise in EventsManager.
     *
     * Returns a single unsubscribe function that removes all listeners at once.
     *
     * @param handlers Object mapping event names to callbacks
     * @returns Single unsubscribe function that removes all listeners
     */
    subscribe(handlers: EventListeners): Promise<() => void>;
    /**
     * Register listeners for WebSocket connection state changes.
     *
     * These are distinct from data events: lifecycle events report on the
     * transport layer (connected, disconnected, reconnecting, reconnected,
     * error), not on server-pushed domain events. They are delivered through
     * EventsManager.addLifecycleListener, which is a separate Map from the
     * data-event listeners Map.
     *
     * Returns an array of individual unsubscribe functions (one per handler
     * registered), unlike `subscribe()` which returns a single composite
     * unsubscribe.
     */
    onLifecycle(handlers: {
        onConnected?: () => void;
        onDisconnected?: (code: number, reason: string) => void;
        onReconnecting?: (attempt: number) => void;
        onReconnected?: (attempt: number) => void;
        onError?: (error: Error) => void;
    }): (() => void)[];
    configure(options: {
        autoConnect?: boolean;
        autoReconnect?: boolean;
        debug?: boolean;
    }): void;
    getConnectionState(): string;
    getListenerCount(): number;
    isConnected(): boolean;
    disconnect(): void;
}
/**
 * Interface for batch event subscription
 * Supports all 65 event types from the Hoody Events API
 */
export interface EventListeners {
    /** Listen to all events */
    onAnyEvent?: (event: EventServerMessage) => void;
    onActivityLogged?: (event: EventServerMessage) => void;
    onAuthTokenCreated?: (event: EventServerMessage) => void;
    onAuthTokenDeleted?: (event: EventServerMessage) => void;
    onAuthTokenDisabled?: (event: EventServerMessage) => void;
    onAuthTokenEnabled?: (event: EventServerMessage) => void;
    onAuthTokenUpdated?: (event: EventServerMessage) => void;
    onContainerAutostartDisabled?: (event: EventServerMessage) => void;
    onContainerAutostartEnabled?: (event: EventServerMessage) => void;
    onContainerCreating?: (event: EventServerMessage) => void;
    onContainerDeleted?: (event: EventServerMessage) => void;
    onContainerDeleting?: (event: EventServerMessage) => void;
    onContainerDisplayEnabled?: (event: EventServerMessage) => void;
    onContainerFailed?: (event: EventServerMessage) => void;
    onContainerRenamed?: (event: EventServerMessage) => void;
    onContainerResourceUpdated?: (event: EventServerMessage) => void;
    onContainerRunning?: (event: EventServerMessage) => void;
    onContainerSnapshotCreated?: (event: EventServerMessage) => void;
    onContainerSnapshotDeleted?: (event: EventServerMessage) => void;
    onContainerSnapshotRenamed?: (event: EventServerMessage) => void;
    onContainerSnapshotRestored?: (event: EventServerMessage) => void;
    onContainerSshKeyAdded?: (event: EventServerMessage) => void;
    onContainerSshKeyRemoved?: (event: EventServerMessage) => void;
    onContainerStopped?: (event: EventServerMessage) => void;
    onFirewallRuleAdded?: (event: EventServerMessage) => void;
    onFirewallRuleDisabled?: (event: EventServerMessage) => void;
    onFirewallRuleEnabled?: (event: EventServerMessage) => void;
    onFirewallRuleRemoved?: (event: EventServerMessage) => void;
    onFirewallRuleUpdated?: (event: EventServerMessage) => void;
    onNotificationCreated?: (event: EventServerMessage) => void;
    onNotificationDeleted?: (event: EventServerMessage) => void;
    onNotificationRead?: (event: EventServerMessage) => void;
    onPoolInvitationRevoked?: (event: EventServerMessage) => void;
    onPoolInvited?: (event: EventServerMessage) => void;
    onPoolMemberJoined?: (event: EventServerMessage) => void;
    onPoolMemberLeft?: (event: EventServerMessage) => void;
    onPoolMemberRoleChanged?: (event: EventServerMessage) => void;
    onProjectCreated?: (event: EventServerMessage) => void;
    onProjectDeleted?: (event: EventServerMessage) => void;
    onProjectUpdated?: (event: EventServerMessage) => void;
    onProxyAliasCreated?: (event: EventServerMessage) => void;
    onProxyAliasDeleted?: (event: EventServerMessage) => void;
    onProxyAliasDisabled?: (event: EventServerMessage) => void;
    onProxyAliasEnabled?: (event: EventServerMessage) => void;
    onProxyAliasExpired?: (event: EventServerMessage) => void;
    onProxyAliasExpiringSoon?: (event: EventServerMessage) => void;
    onProxyAliasUpdated?: (event: EventServerMessage) => void;
    onProxyPermissionsDefaultChanged?: (event: EventServerMessage) => void;
    onProxyPermissionsGroupAdded?: (event: EventServerMessage) => void;
    onProxyPermissionsGroupRemoved?: (event: EventServerMessage) => void;
    onProxyPermissionsGroupUpdated?: (event: EventServerMessage) => void;
    onProxyPermissionsUpdated?: (event: EventServerMessage) => void;
    onServerHealthChanged?: (event: EventServerMessage) => void;
    onServerRentalExpiring?: (event: EventServerMessage) => void;
    onStorageShareCreated?: (event: EventServerMessage) => void;
    onStorageShareDeleted?: (event: EventServerMessage) => void;
    onStorageShareDisabled?: (event: EventServerMessage) => void;
    onStorageShareEnabled?: (event: EventServerMessage) => void;
    onStorageShareExpired?: (event: EventServerMessage) => void;
    onStorageShareExpiringSoon?: (event: EventServerMessage) => void;
    onStorageShareMountChanged?: (event: EventServerMessage) => void;
    onStorageShareUpdated?: (event: EventServerMessage) => void;
    onUserBanned?: (event: EventServerMessage) => void;
    onUserCreated?: (event: EventServerMessage) => void;
    onUserRoleChanged?: (event: EventServerMessage) => void;
    onUserUnbanned?: (event: EventServerMessage) => void;
}
