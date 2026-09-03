import state from '../utils/state.js';

const MIN_M = 500;
const MAX_M = 50000;

/** Controls the map's geographic extent (radius in metres from centre). */
export class DistanceControl extends HTMLElement {
  connectedCallback() {
    this.render();
  }

  render() {
    const distanceM = state.get('distanceM');
    this.innerHTML = `
      <label for="distance-range">Map radius: <span class="distance-value">${(distanceM / 1000).toFixed(1)}</span> km</label>
      <input type="range" id="distance-range" min="${MIN_M}" max="${MAX_M}" step="100" value="${distanceM}">
      <input type="number" id="distance-number" min="${MIN_M}" max="${MAX_M}" step="100" value="${distanceM}">
    `;

    const range = this.querySelector('#distance-range');
    const number = this.querySelector('#distance-number');
    const label = this.querySelector('.distance-value');

    const apply = (value) => {
      const distanceM = Math.min(MAX_M, Math.max(MIN_M, Number(value)));
      range.value = distanceM;
      number.value = distanceM;
      label.textContent = (distanceM / 1000).toFixed(1);
      state.set('distanceM', distanceM);
    };

    range.addEventListener('input', (ev) => apply(ev.target.value));
    number.addEventListener('change', (ev) => apply(ev.target.value));
  }
}
