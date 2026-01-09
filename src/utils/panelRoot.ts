/**
 * Manages a separate React root for the MobileBottomPanel.
 * This completely isolates the panel from the main React tree,
 * preventing any coupling with the large book content DOM.
 */

import { createRoot, Root } from 'react-dom/client';
import { createElement } from 'react';

let panelRoot: Root | null = null;
let containerElement: HTMLDivElement | null = null;

/**
 * Initialize the panel root. Should be called once on mobile.
 * Creates a separate React root that is completely independent
 * from the main app's reconciliation tree.
 */
export function initializePanelRoot(PanelComponent: React.ComponentType): void {
  if (typeof window === 'undefined') return;
  if (panelRoot) return; // Already initialized
  
  // Create container element outside of any React-managed DOM
  containerElement = document.createElement('div');
  containerElement.id = 'mobile-panel-root';
  containerElement.style.cssText = 'position: fixed; z-index: 9999; pointer-events: none;';
  document.body.appendChild(containerElement);
  
  // Create a completely separate React root
  panelRoot = createRoot(containerElement);
  
  // Render the panel - it manages its own state via events
  panelRoot.render(createElement(PanelComponent));
}

/**
 * Cleanup the panel root. Should be called when unmounting.
 */
export function cleanupPanelRoot(): void {
  if (panelRoot) {
    panelRoot.unmount();
    panelRoot = null;
  }
  if (containerElement && containerElement.parentNode) {
    containerElement.parentNode.removeChild(containerElement);
    containerElement = null;
  }
}

/**
 * Check if the panel root is initialized.
 */
export function isPanelRootInitialized(): boolean {
  return panelRoot !== null;
}

