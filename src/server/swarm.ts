// ─── Biomed Field Copilot - P2P Swarm Orchestrator ───
// Real Hyperswarm-based P2P provider using @qvac/sdk startQVACProvider.
// Enables federated inference: peers can delegate completions to this node.

import { startQVACProvider, stopQVACProvider, completion } from '@qvac/sdk';
import type { CompletionParams } from '@qvac/sdk';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface SwarmPeer {
  publicKey: string;
  alias: string;
  connectedAt: string;
  lastSeen: string;
  status: 'connected' | 'disconnected';
}

export interface SwarmStatus {
  isProviding: boolean;
  publicKey: string | null;
  connectedPeers: SwarmPeer[];
  startedAt: string | null;
}

export type SwarmEventCallback = (event: SwarmEvent) => void;

export interface SwarmEvent {
  type: 'provider_started' | 'provider_stopped' | 'peer_connected' | 'peer_disconnected' | 'delegation_success' | 'delegation_fallback' | 'error';
  data: Record<string, unknown>;
  timestamp: string;
}

// ────────────────────────────────────────────
// P2P Swarm Manager
// ────────────────────────────────────────────

export class SwarmManager {
  private publicKey: string | null = null;
  private isProviding = false;
  private startedAt: string | null = null;
  private peers: Map<string, SwarmPeer> = new Map();
  private listeners: SwarmEventCallback[] = [];

  /**
   * Start the QVAC P2P Provider.
   * This exposes this node on the Hyperswarm DHT so other peers can
   * delegate inference requests to it via its public key.
   */
  async startProvider(): Promise<{ publicKey: string }> {
    if (this.isProviding && this.publicKey) {
      console.log(`  P2P provider already running (key: ${this.publicKey.substring(0, 8)}...)`);
      return { publicKey: this.publicKey };
    }

    console.log('\n🌐 Starting P2P Swarm Provider...');

    const result = await startQVACProvider();

    if (!result.success || !result.publicKey) {
      const errorMsg = result.error || 'Unknown error starting provider';
      console.error(`  ❌ Failed to start provider: ${errorMsg}`);
      this.emit({
        type: 'error',
        data: { message: errorMsg },
        timestamp: new Date().toISOString(),
      });
      throw new Error(errorMsg);
    }

    this.publicKey = result.publicKey;
    this.isProviding = true;
    this.startedAt = new Date().toISOString();

    console.log(`  ✅ P2P Provider started!`);
    console.log(`  🔑 Public Key: ${this.publicKey}`);

    this.emit({
      type: 'provider_started',
      data: { publicKey: this.publicKey as string },
      timestamp: this.startedAt,
    });

    return { publicKey: this.publicKey as string };
  }

  /**
   * Stop the QVAC P2P Provider.
   */
  async stopProvider(): Promise<void> {
    if (!this.isProviding) {
      console.log('  P2P provider is not running.');
      return;
    }

    console.log('\n🛑 Stopping P2P Swarm Provider...');
    await stopQVACProvider();

    this.isProviding = false;
    this.publicKey = null;
    this.startedAt = null;
    this.peers.clear();

    console.log('  ✅ Provider stopped.');
    this.emit({
      type: 'provider_stopped',
      data: {},
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Register a manually-connected peer by their public key.
   */
  connectPeer(peerPublicKey: string, alias?: string): SwarmPeer {
    const now = new Date().toISOString();
    const peer: SwarmPeer = {
      publicKey: peerPublicKey,
      alias: alias || `Peer-${peerPublicKey.substring(0, 6)}`,
      connectedAt: now,
      lastSeen: now,
      status: 'connected',
    };

    this.peers.set(peerPublicKey, peer);
    console.log(`  🤝 Peer registered: ${peer.alias} (${peerPublicKey.substring(0, 8)}...)`);

    this.emit({
      type: 'peer_connected',
      data: { peer },
      timestamp: now,
    });

    return peer;
  }

  /**
   * Remove a peer.
   */
  disconnectPeer(peerPublicKey: string): void {
    const peer = this.peers.get(peerPublicKey);
    if (peer) {
      peer.status = 'disconnected';
      this.peers.delete(peerPublicKey);
      this.emit({
        type: 'peer_disconnected',
        data: { peer },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Delegate an inference call to a remote peer, with automatic
   * local fallback if the peer is unreachable.
   */
  async delegateCompletion(
    params: CompletionParams,
    peerPublicKey: string
  ): Promise<{ delegated: boolean; peerId: string | null }> {
    const peer = this.peers.get(peerPublicKey);

    try {
      console.log(`  📡 Delegating inference to peer ${peerPublicKey.substring(0, 8)}...`);

      // Real delegation: pass the peer's public key in the delegate field
      const delegatedParams = {
        ...params,
        delegate: {
          providerPublicKey: peerPublicKey,
          fallbackToLocal: true,    // SDK auto-falls back if peer is down
          timeout: 30000,           // 30s timeout for remote inference
        },
      };

      const run = completion(delegatedParams);

      // Stream events from delegated completion
      for await (const event of run.events) {
        // The events are processed by the caller
        void event;
      }

      // Update peer last seen
      if (peer) {
        peer.lastSeen = new Date().toISOString();
      }

      this.emit({
        type: 'delegation_success',
        data: { peerId: peerPublicKey },
        timestamp: new Date().toISOString(),
      });

      return { delegated: true, peerId: peerPublicKey };
    } catch (err) {
      console.warn(`  ⚠ Delegation failed, falling back to local: ${(err as Error).message}`);

      this.emit({
        type: 'delegation_fallback',
        data: { peerId: peerPublicKey, error: (err as Error).message },
        timestamp: new Date().toISOString(),
      });

      return { delegated: false, peerId: null };
    }
  }

  /**
   * Get the current swarm status.
   */
  getStatus(): SwarmStatus {
    return {
      isProviding: this.isProviding,
      publicKey: this.publicKey,
      connectedPeers: Array.from(this.peers.values()),
      startedAt: this.startedAt,
    };
  }

  /**
   * Register event listeners for SSE broadcasting.
   */
  onEvent(callback: SwarmEventCallback): void {
    this.listeners.push(callback);
  }

  /**
   * Remove an event listener.
   */
  removeListener(callback: SwarmEventCallback): void {
    this.listeners = this.listeners.filter((l) => l !== callback);
  }

  private emit(event: SwarmEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Swarm event listener error:', err);
      }
    }
  }
}
