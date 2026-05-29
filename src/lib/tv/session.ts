/**
 * Shared localStorage key for a paired (anonymous) TV session token.
 *
 * Lives in its own module — free of "use client" and of any component
 * import — so both `TVApp` (which mints/stores the token) and `TVMode`
 * (which reads it for the version poll) can reference one source of truth
 * without creating an import cycle between the two components.
 */
export const tvSessionKey = (slideshowId: string) =>
  `atlas:tv-session:${slideshowId}`;
