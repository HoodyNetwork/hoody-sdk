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
import { EventsManager } from './events-manager.js';
import type { EventServerMessage } from './events-types.js';
import { ApiConnecteventstreamWebSocket } from './events-types.js';

export class EventsClient {
    private manager: EventsManager;
    private baseURL: string;
    private getToken: (() => string | null) | undefined;

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
    constructor(eventsService: EventsService, baseURL?: string, getToken?: () => string | null) {
        // Extract baseURL from the service's http client
        this.baseURL = baseURL
            || (eventsService as any)?.http?.getBaseURL?.()
            || (eventsService as any)?.http?.config?.baseURL
            || 'https://api.hoody.com';
        // Default token resolver reads from the underlying service HTTP client if not provided
        this.getToken = getToken ?? (() => {
            try {
                return (eventsService as any)?.http?.config?.token ?? null;
            } catch {
                return null;
            }
        });

        this.manager = new EventsManager(
            async () => {
                // Construct WebSocket URL (base URL only, path is in options)
                const wsUrl = this.baseURL.replace(/^http/, 'ws');

                // Get authentication token if available
                const token = this.getToken?.();
                const options: any = {
                    path: '/api/v1/events',  // ← Server handles both GET and WebSocket UPGRADE on this path
                };

                if (token) {
                    options.auth = { token };  // Use auth object, not query param
                }

                // Create the wrapper but DO NOT connect here — EventsManager
                // installs lifecycle + message listeners before calling
                // `connect()` itself, so no early events can be lost to a
                // socket that handshakes before listeners attach.
                return new ApiConnecteventstreamWebSocket(wsUrl, options);
            },
            {
                autoConnect: true,
                autoReconnect: true,
                debug: false,
            }
        );
    }

    // ============================================================================
    // Activity Events (1 events)
    // ============================================================================

    /**
     * Listen for activity.logged events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onActivityLogged(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('activity.logged', callback);
    }

    // ============================================================================
    // Auth Events (5 events)
    // ============================================================================

    /**
     * Listen for auth.token.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAuthTokenCreated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('auth.token.created', callback);
    }

    /**
     * Listen for auth.token.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAuthTokenDeleted(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('auth.token.deleted', callback);
    }

    /**
     * Listen for auth.token.disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAuthTokenDisabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('auth.token.disabled', callback);
    }

    /**
     * Listen for auth.token.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAuthTokenEnabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('auth.token.enabled', callback);
    }

    /**
     * Listen for auth.token.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAuthTokenUpdated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('auth.token.updated', callback);
    }

    // ============================================================================
    // Container Events (17 events)
    // ============================================================================

    /**
     * Listen for container.autostart_disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerAutostartDisabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.autostart_disabled', callback);
    }

    /**
     * Listen for container.autostart_enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerAutostartEnabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.autostart_enabled', callback);
    }

    /**
     * Listen for container.creating events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerCreating(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.creating', callback);
    }

    /**
     * Listen for container.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerDeleted(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.deleted', callback);
    }

    /**
     * Listen for container.deleting events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerDeleting(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.deleting', callback);
    }

    /**
     * Listen for container.display.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerDisplayEnabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.display.enabled', callback);
    }

    /**
     * Listen for container.failed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerFailed(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.failed', callback);
    }

    /**
     * Listen for container.renamed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerRenamed(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.renamed', callback);
    }

    /**
     * Listen for container.resource_updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerResourceUpdated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.resource_updated', callback);
    }

    /**
     * Listen for container.running events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerRunning(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.running', callback);
    }

    /**
     * Listen for container.snapshot.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerSnapshotCreated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.snapshot.created', callback);
    }

    /**
     * Listen for container.snapshot.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerSnapshotDeleted(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.snapshot.deleted', callback);
    }

    /**
     * Listen for container.snapshot.renamed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerSnapshotRenamed(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.snapshot.renamed', callback);
    }

    /**
     * Listen for container.snapshot.restored events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerSnapshotRestored(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.snapshot.restored', callback);
    }

    /**
     * Listen for container.ssh_key.added events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerSshKeyAdded(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.ssh_key.added', callback);
    }

    /**
     * Listen for container.ssh_key.removed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerSshKeyRemoved(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.ssh_key.removed', callback);
    }

    /**
     * Listen for container.stopped events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerStopped(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.stopped', callback);
    }

    // ============================================================================
    // Firewall Events (5 events)
    // ============================================================================

    /**
     * Listen for firewall.rule.added events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onFirewallRuleAdded(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('firewall.rule.added', callback);
    }

    /**
     * Listen for firewall.rule.disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onFirewallRuleDisabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('firewall.rule.disabled', callback);
    }

    /**
     * Listen for firewall.rule.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onFirewallRuleEnabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('firewall.rule.enabled', callback);
    }

    /**
     * Listen for firewall.rule.removed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onFirewallRuleRemoved(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('firewall.rule.removed', callback);
    }

    /**
     * Listen for firewall.rule.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onFirewallRuleUpdated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('firewall.rule.updated', callback);
    }

    // ============================================================================
    // Notification Events (3 events)
    // ============================================================================

    /**
     * Listen for notification.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onNotificationCreated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('notification.created', callback);
    }

    /**
     * Listen for notification.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onNotificationDeleted(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('notification.deleted', callback);
    }

    /**
     * Listen for notification.read events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onNotificationRead(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('notification.read', callback);
    }

    // ============================================================================
    // Pool Events (5 events)
    // ============================================================================

    /**
     * Listen for pool.invitation_revoked events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onPoolInvitationRevoked(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('pool.invitation_revoked', callback);
    }

    /**
     * Listen for pool.invited events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onPoolInvited(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('pool.invited', callback);
    }

    /**
     * Listen for pool.member.joined events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onPoolMemberJoined(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('pool.member.joined', callback);
    }

    /**
     * Listen for pool.member.left events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onPoolMemberLeft(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('pool.member.left', callback);
    }

    /**
     * Listen for pool.member.role_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onPoolMemberRoleChanged(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('pool.member.role_changed', callback);
    }

    // ============================================================================
    // Project Events (3 events)
    // ============================================================================

    /**
     * Listen for project.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProjectCreated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('project.created', callback);
    }

    /**
     * Listen for project.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProjectDeleted(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('project.deleted', callback);
    }

    /**
     * Listen for project.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProjectUpdated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('project.updated', callback);
    }

    // ============================================================================
    // Proxy Events (12 events)
    // ============================================================================

    /**
     * Listen for proxy.alias.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasCreated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.alias.created', callback);
    }

    /**
     * Listen for proxy.alias.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasDeleted(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.alias.deleted', callback);
    }

    /**
     * Listen for proxy.alias.disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasDisabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.alias.disabled', callback);
    }

    /**
     * Listen for proxy.alias.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasEnabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.alias.enabled', callback);
    }

    /**
     * Listen for proxy.alias.expired events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasExpired(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.alias.expired', callback);
    }

    /**
     * Listen for proxy.alias.expiring_soon events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasExpiringSoon(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.alias.expiring_soon', callback);
    }

    /**
     * Listen for proxy.alias.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasUpdated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.alias.updated', callback);
    }

    /**
     * Listen for proxy.permissions.default_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyPermissionsDefaultChanged(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.permissions.default_changed', callback);
    }

    /**
     * Listen for proxy.permissions.group_added events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyPermissionsGroupAdded(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.permissions.group_added', callback);
    }

    /**
     * Listen for proxy.permissions.group_removed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyPermissionsGroupRemoved(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.permissions.group_removed', callback);
    }

    /**
     * Listen for proxy.permissions.group_updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyPermissionsGroupUpdated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.permissions.group_updated', callback);
    }

    /**
     * Listen for proxy.permissions.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyPermissionsUpdated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.permissions.updated', callback);
    }

    // ============================================================================
    // Server Events (2 events)
    // ============================================================================

    /**
     * Listen for server.health_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onServerHealthChanged(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('server.health_changed', callback);
    }

    /**
     * Listen for server.rental_expiring events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onServerRentalExpiring(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('server.rental_expiring', callback);
    }

    // ============================================================================
    // Storage Events (8 events)
    // ============================================================================

    /**
     * Listen for storage.share.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareCreated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('storage.share.created', callback);
    }

    /**
     * Listen for storage.share.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareDeleted(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('storage.share.deleted', callback);
    }

    /**
     * Listen for storage.share.disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareDisabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('storage.share.disabled', callback);
    }

    /**
     * Listen for storage.share.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareEnabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('storage.share.enabled', callback);
    }

    /**
     * Listen for storage.share.expired events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareExpired(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('storage.share.expired', callback);
    }

    /**
     * Listen for storage.share.expiring_soon events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareExpiringSoon(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('storage.share.expiring_soon', callback);
    }

    /**
     * Listen for storage.share.mount_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareMountChanged(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('storage.share.mount_changed', callback);
    }

    /**
     * Listen for storage.share.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareUpdated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('storage.share.updated', callback);
    }

    // ============================================================================
    // User Events (4 events)
    // ============================================================================

    /**
     * Listen for user.banned events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onUserBanned(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('user.banned', callback);
    }

    /**
     * Listen for user.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onUserCreated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('user.created', callback);
    }

    /**
     * Listen for user.role_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onUserRoleChanged(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('user.role_changed', callback);
    }

    /**
     * Listen for user.unbanned events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onUserUnbanned(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('user.unbanned', callback);
    }

    // ============================================================================
    // Resource-Specific Listeners
    // ============================================================================
    // These use the wildcard event type "*" combined with an EventFilter
    // so that EventsManager.routeEvent delivers every event whose resource_id
    // and resource_type match the filter, regardless of event_type.

    /**
     * Listen to all events for a specific container.
     * Uses wildcard "*" event type with a filter on resourceId + resourceType.
     * @param containerId Container ID to filter events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerEvents(
        containerId: string,
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('*', callback, {
            resourceId: containerId,
            resourceType: 'container',
        });
    }

    /**
     * Listen to all events for a specific project
     * @param projectId Project ID to filter events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProjectEvents(
        projectId: string,
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('*', callback, {
            resourceId: projectId,
            resourceType: 'project',
        });
    }

    /**
     * Listen to ALL events (no filtering)
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAnyEvent(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('*', callback);
    }

    // ============================================================================
    // Batch Subscription
    // ==========================================================================

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
    async subscribe(handlers: EventListeners): Promise<() => void> {
        const unsubscribers: Array<() => void> = [];

        // Wrap every await in a single try so a partial-failure
        // (e.g. WebSocket drop mid-batch) unwinds already-registered listeners
        // before rethrowing. Pre-fix the first N successful registrations were
        // trapped in a local array the caller never received, leading to a
        // permanent listener leak and forever-on connection.
        try {

        // Special handlers
        if (handlers.onAnyEvent) {
            unsubscribers.push(await this.onAnyEvent(handlers.onAnyEvent));
        }

        // All 65 event types
        if (handlers.onActivityLogged) unsubscribers.push(await this.onActivityLogged(handlers.onActivityLogged));
        if (handlers.onAuthTokenCreated) unsubscribers.push(await this.onAuthTokenCreated(handlers.onAuthTokenCreated));
        if (handlers.onAuthTokenDeleted) unsubscribers.push(await this.onAuthTokenDeleted(handlers.onAuthTokenDeleted));
        if (handlers.onAuthTokenDisabled) unsubscribers.push(await this.onAuthTokenDisabled(handlers.onAuthTokenDisabled));
        if (handlers.onAuthTokenEnabled) unsubscribers.push(await this.onAuthTokenEnabled(handlers.onAuthTokenEnabled));
        if (handlers.onAuthTokenUpdated) unsubscribers.push(await this.onAuthTokenUpdated(handlers.onAuthTokenUpdated));
        if (handlers.onContainerAutostartDisabled) unsubscribers.push(await this.onContainerAutostartDisabled(handlers.onContainerAutostartDisabled));
        if (handlers.onContainerAutostartEnabled) unsubscribers.push(await this.onContainerAutostartEnabled(handlers.onContainerAutostartEnabled));
        if (handlers.onContainerCreating) unsubscribers.push(await this.onContainerCreating(handlers.onContainerCreating));
        if (handlers.onContainerDeleted) unsubscribers.push(await this.onContainerDeleted(handlers.onContainerDeleted));
        if (handlers.onContainerDeleting) unsubscribers.push(await this.onContainerDeleting(handlers.onContainerDeleting));
        if (handlers.onContainerDisplayEnabled) unsubscribers.push(await this.onContainerDisplayEnabled(handlers.onContainerDisplayEnabled));
        if (handlers.onContainerFailed) unsubscribers.push(await this.onContainerFailed(handlers.onContainerFailed));
        if (handlers.onContainerRenamed) unsubscribers.push(await this.onContainerRenamed(handlers.onContainerRenamed));
        if (handlers.onContainerResourceUpdated) unsubscribers.push(await this.onContainerResourceUpdated(handlers.onContainerResourceUpdated));
        if (handlers.onContainerRunning) unsubscribers.push(await this.onContainerRunning(handlers.onContainerRunning));
        if (handlers.onContainerSnapshotCreated) unsubscribers.push(await this.onContainerSnapshotCreated(handlers.onContainerSnapshotCreated));
        if (handlers.onContainerSnapshotDeleted) unsubscribers.push(await this.onContainerSnapshotDeleted(handlers.onContainerSnapshotDeleted));
        if (handlers.onContainerSnapshotRenamed) unsubscribers.push(await this.onContainerSnapshotRenamed(handlers.onContainerSnapshotRenamed));
        if (handlers.onContainerSnapshotRestored) unsubscribers.push(await this.onContainerSnapshotRestored(handlers.onContainerSnapshotRestored));
        if (handlers.onContainerSshKeyAdded) unsubscribers.push(await this.onContainerSshKeyAdded(handlers.onContainerSshKeyAdded));
        if (handlers.onContainerSshKeyRemoved) unsubscribers.push(await this.onContainerSshKeyRemoved(handlers.onContainerSshKeyRemoved));
        if (handlers.onContainerStopped) unsubscribers.push(await this.onContainerStopped(handlers.onContainerStopped));
        if (handlers.onFirewallRuleAdded) unsubscribers.push(await this.onFirewallRuleAdded(handlers.onFirewallRuleAdded));
        if (handlers.onFirewallRuleDisabled) unsubscribers.push(await this.onFirewallRuleDisabled(handlers.onFirewallRuleDisabled));
        if (handlers.onFirewallRuleEnabled) unsubscribers.push(await this.onFirewallRuleEnabled(handlers.onFirewallRuleEnabled));
        if (handlers.onFirewallRuleRemoved) unsubscribers.push(await this.onFirewallRuleRemoved(handlers.onFirewallRuleRemoved));
        if (handlers.onFirewallRuleUpdated) unsubscribers.push(await this.onFirewallRuleUpdated(handlers.onFirewallRuleUpdated));
        if (handlers.onNotificationCreated) unsubscribers.push(await this.onNotificationCreated(handlers.onNotificationCreated));
        if (handlers.onNotificationDeleted) unsubscribers.push(await this.onNotificationDeleted(handlers.onNotificationDeleted));
        if (handlers.onNotificationRead) unsubscribers.push(await this.onNotificationRead(handlers.onNotificationRead));
        if (handlers.onPoolInvitationRevoked) unsubscribers.push(await this.onPoolInvitationRevoked(handlers.onPoolInvitationRevoked));
        if (handlers.onPoolInvited) unsubscribers.push(await this.onPoolInvited(handlers.onPoolInvited));
        if (handlers.onPoolMemberJoined) unsubscribers.push(await this.onPoolMemberJoined(handlers.onPoolMemberJoined));
        if (handlers.onPoolMemberLeft) unsubscribers.push(await this.onPoolMemberLeft(handlers.onPoolMemberLeft));
        if (handlers.onPoolMemberRoleChanged) unsubscribers.push(await this.onPoolMemberRoleChanged(handlers.onPoolMemberRoleChanged));
        if (handlers.onProjectCreated) unsubscribers.push(await this.onProjectCreated(handlers.onProjectCreated));
        if (handlers.onProjectDeleted) unsubscribers.push(await this.onProjectDeleted(handlers.onProjectDeleted));
        if (handlers.onProjectUpdated) unsubscribers.push(await this.onProjectUpdated(handlers.onProjectUpdated));
        if (handlers.onProxyAliasCreated) unsubscribers.push(await this.onProxyAliasCreated(handlers.onProxyAliasCreated));
        if (handlers.onProxyAliasDeleted) unsubscribers.push(await this.onProxyAliasDeleted(handlers.onProxyAliasDeleted));
        if (handlers.onProxyAliasDisabled) unsubscribers.push(await this.onProxyAliasDisabled(handlers.onProxyAliasDisabled));
        if (handlers.onProxyAliasEnabled) unsubscribers.push(await this.onProxyAliasEnabled(handlers.onProxyAliasEnabled));
        if (handlers.onProxyAliasExpired) unsubscribers.push(await this.onProxyAliasExpired(handlers.onProxyAliasExpired));
        if (handlers.onProxyAliasExpiringSoon) unsubscribers.push(await this.onProxyAliasExpiringSoon(handlers.onProxyAliasExpiringSoon));
        if (handlers.onProxyAliasUpdated) unsubscribers.push(await this.onProxyAliasUpdated(handlers.onProxyAliasUpdated));
        if (handlers.onProxyPermissionsDefaultChanged) unsubscribers.push(await this.onProxyPermissionsDefaultChanged(handlers.onProxyPermissionsDefaultChanged));
        if (handlers.onProxyPermissionsGroupAdded) unsubscribers.push(await this.onProxyPermissionsGroupAdded(handlers.onProxyPermissionsGroupAdded));
        if (handlers.onProxyPermissionsGroupRemoved) unsubscribers.push(await this.onProxyPermissionsGroupRemoved(handlers.onProxyPermissionsGroupRemoved));
        if (handlers.onProxyPermissionsGroupUpdated) unsubscribers.push(await this.onProxyPermissionsGroupUpdated(handlers.onProxyPermissionsGroupUpdated));
        if (handlers.onProxyPermissionsUpdated) unsubscribers.push(await this.onProxyPermissionsUpdated(handlers.onProxyPermissionsUpdated));
        if (handlers.onServerHealthChanged) unsubscribers.push(await this.onServerHealthChanged(handlers.onServerHealthChanged));
        if (handlers.onServerRentalExpiring) unsubscribers.push(await this.onServerRentalExpiring(handlers.onServerRentalExpiring));
        if (handlers.onStorageShareCreated) unsubscribers.push(await this.onStorageShareCreated(handlers.onStorageShareCreated));
        if (handlers.onStorageShareDeleted) unsubscribers.push(await this.onStorageShareDeleted(handlers.onStorageShareDeleted));
        if (handlers.onStorageShareDisabled) unsubscribers.push(await this.onStorageShareDisabled(handlers.onStorageShareDisabled));
        if (handlers.onStorageShareEnabled) unsubscribers.push(await this.onStorageShareEnabled(handlers.onStorageShareEnabled));
        if (handlers.onStorageShareExpired) unsubscribers.push(await this.onStorageShareExpired(handlers.onStorageShareExpired));
        if (handlers.onStorageShareExpiringSoon) unsubscribers.push(await this.onStorageShareExpiringSoon(handlers.onStorageShareExpiringSoon));
        if (handlers.onStorageShareMountChanged) unsubscribers.push(await this.onStorageShareMountChanged(handlers.onStorageShareMountChanged));
        if (handlers.onStorageShareUpdated) unsubscribers.push(await this.onStorageShareUpdated(handlers.onStorageShareUpdated));
        if (handlers.onUserBanned) unsubscribers.push(await this.onUserBanned(handlers.onUserBanned));
        if (handlers.onUserCreated) unsubscribers.push(await this.onUserCreated(handlers.onUserCreated));
        if (handlers.onUserRoleChanged) unsubscribers.push(await this.onUserRoleChanged(handlers.onUserRoleChanged));
        if (handlers.onUserUnbanned) unsubscribers.push(await this.onUserUnbanned(handlers.onUserUnbanned));

        return () => {
            // Wrap each unsub individually so a single throw doesn't
            // leak the remaining listeners in the manager's map (parity with
            // the error-path cleanup below).
            for (const unsub of unsubscribers) {
                try { unsub(); } catch { /* best effort */ }
            }
        };
        } catch (err) {
            // Partial-failure cleanup — unwind already-registered listeners
            // so they are NOT orphaned in the manager's map. Swallow each
            // unsub's own errors; the original error is what matters.
            for (const unsub of unsubscribers) {
                try { unsub(); } catch { /* best effort */ }
            }
            throw err;
        }
    }

    // ============================================================================
    // Lifecycle Monitoring (optional)
    // ============================================================================

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
    }): (() => void)[] {
        const unsubscribers: Array<() => void> = [];

        if (handlers.onConnected) {
            unsubscribers.push(this.manager.addLifecycleListener('connected', handlers.onConnected));
        }
        if (handlers.onDisconnected) {
            unsubscribers.push(this.manager.addLifecycleListener('disconnected', handlers.onDisconnected));
        }
        if (handlers.onReconnecting) {
            unsubscribers.push(this.manager.addLifecycleListener('reconnecting', handlers.onReconnecting));
        }
        if (handlers.onReconnected) {
            unsubscribers.push(this.manager.addLifecycleListener('reconnected', handlers.onReconnected));
        }
        if (handlers.onError) {
            unsubscribers.push(this.manager.addLifecycleListener('error', handlers.onError));
        }

        return unsubscribers;
    }

    // ============================================================================
    // Configuration
    // ============================================================================

    configure(options: {
        autoConnect?: boolean;
        autoReconnect?: boolean;
        debug?: boolean;
    }): void {
        this.manager.configure(options);
    }

    getConnectionState(): string {
        return this.manager.getState();
    }

    getListenerCount(): number {
        return this.manager.getListenerCount();
    }

    isConnected(): boolean {
        return this.manager.isConnected();
    }

    disconnect(): void {
        this.manager.disconnect();
    }
}

// ============================================================================
// EventListeners Interface (for subscribe() method)
// ============================================================================

/**
 * Interface for batch event subscription
 * Supports all 65 event types from the Hoody Events API
 */
export interface EventListeners {
    /** Listen to all events */
    onAnyEvent?: (event: EventServerMessage) => void;

    // Activity Events (1)
    onActivityLogged?: (event: EventServerMessage) => void;

    // Auth Events (5)
    onAuthTokenCreated?: (event: EventServerMessage) => void;
    onAuthTokenDeleted?: (event: EventServerMessage) => void;
    onAuthTokenDisabled?: (event: EventServerMessage) => void;
    onAuthTokenEnabled?: (event: EventServerMessage) => void;
    onAuthTokenUpdated?: (event: EventServerMessage) => void;

    // Container Events (17)
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

    // Firewall Events (5)
    onFirewallRuleAdded?: (event: EventServerMessage) => void;
    onFirewallRuleDisabled?: (event: EventServerMessage) => void;
    onFirewallRuleEnabled?: (event: EventServerMessage) => void;
    onFirewallRuleRemoved?: (event: EventServerMessage) => void;
    onFirewallRuleUpdated?: (event: EventServerMessage) => void;

    // Notification Events (3)
    onNotificationCreated?: (event: EventServerMessage) => void;
    onNotificationDeleted?: (event: EventServerMessage) => void;
    onNotificationRead?: (event: EventServerMessage) => void;

    // Pool Events (5)
    onPoolInvitationRevoked?: (event: EventServerMessage) => void;
    onPoolInvited?: (event: EventServerMessage) => void;
    onPoolMemberJoined?: (event: EventServerMessage) => void;
    onPoolMemberLeft?: (event: EventServerMessage) => void;
    onPoolMemberRoleChanged?: (event: EventServerMessage) => void;

    // Project Events (3)
    onProjectCreated?: (event: EventServerMessage) => void;
    onProjectDeleted?: (event: EventServerMessage) => void;
    onProjectUpdated?: (event: EventServerMessage) => void;

    // Proxy Events (12)
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

    // Server Events (2)
    onServerHealthChanged?: (event: EventServerMessage) => void;
    onServerRentalExpiring?: (event: EventServerMessage) => void;

    // Storage Events (8)
    onStorageShareCreated?: (event: EventServerMessage) => void;
    onStorageShareDeleted?: (event: EventServerMessage) => void;
    onStorageShareDisabled?: (event: EventServerMessage) => void;
    onStorageShareEnabled?: (event: EventServerMessage) => void;
    onStorageShareExpired?: (event: EventServerMessage) => void;
    onStorageShareExpiringSoon?: (event: EventServerMessage) => void;
    onStorageShareMountChanged?: (event: EventServerMessage) => void;
    onStorageShareUpdated?: (event: EventServerMessage) => void;

    // User Events (4)
    onUserBanned?: (event: EventServerMessage) => void;
    onUserCreated?: (event: EventServerMessage) => void;
    onUserRoleChanged?: (event: EventServerMessage) => void;
    onUserUnbanned?: (event: EventServerMessage) => void;
}
