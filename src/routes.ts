import { isEnvelopeHash } from "./engine/envelope"

export function isRouteHash(hash: string): boolean {
  return hash === "" || hash === "#design-system" || isEnvelopeHash(hash)
}
