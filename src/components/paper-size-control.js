import state from '../utils/state.js';
import { PAPER_SIZES, DPI_OPTIONS, computePrintPx } from '../utils/paper.js';

/** Controls paper size (up to A0, or a custom size) and export DPI. */
export class PaperSizeControl extends HTMLElement {
  connectedCallback() {
    this.render();
  }

  render() {
    const paperSizeId = state.get('paperSizeId');
    const dpi = state.get('dpi');
    const customWidthMM = state.get('customWidthMM');
    const customHeightMM = state.get('customHeightMM');
    const isCustom = paperSizeId === 'custom';

    this.innerHTML = `
      <label for="paper-size-select">Paper size</label>
      <select id="paper-size-select">
        ${PAPER_SIZES.map((s) => `<option value="${s.id}" ${s.id === paperSizeId ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select>

      <div class="paper-size-custom" ${isCustom ? '' : 'hidden'}>
        <label for="paper-size-custom-w">Width (mm)</label>
        <input type="number" id="paper-size-custom-w" min="10" max="5000" value="${customWidthMM}">
        <label for="paper-size-custom-h">Height (mm)</label>
        <input type="number" id="paper-size-custom-h" min="10" max="5000" value="${customHeightMM}">
      </div>

      <label for="paper-size-dpi">Resolution (DPI)</label>
      <select id="paper-size-dpi">
        ${DPI_OPTIONS.map((d) => `<option value="${d}" ${d === dpi ? 'selected' : ''}>${d} dpi</option>`).join('')}
      </select>

      <p class="paper-size-info"></p>
    `;

    this.querySelector('#paper-size-select').addEventListener('change', (ev) => {
      state.set('paperSizeId', ev.target.value);
      this.render();
    });

    this.querySelector('#paper-size-custom-w')?.addEventListener('change', (ev) => {
      state.set('customWidthMM', Number(ev.target.value));
      this.#updateInfo();
    });
    this.querySelector('#paper-size-custom-h')?.addEventListener('change', (ev) => {
      state.set('customHeightMM', Number(ev.target.value));
      this.#updateInfo();
    });

    this.querySelector('#paper-size-dpi').addEventListener('change', (ev) => {
      state.set('dpi', Number(ev.target.value));
      this.#updateInfo();
    });

    this.#updateInfo();
  }

  #updateInfo() {
    const { w, h } = computePrintPx({
      paperSizeId: state.get('paperSizeId'),
      customWidthMM: state.get('customWidthMM'),
      customHeightMM: state.get('customHeightMM'),
      dpi: state.get('dpi'),
    });
    const info = this.querySelector('.paper-size-info');
    if (info) info.textContent = `Output size: ${w} × ${h} px`;
  }
}
