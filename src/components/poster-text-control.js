import state from '../utils/state.js';

/** Controls the optional title / subtitle text baked into the exported poster. */
export class PosterTextControl extends HTMLElement {
  connectedCallback() {
    this.render();
  }

  render() {
    const title = state.get('title');
    const subtitle = state.get('subtitle');
    const autoSubtitle = state.get('autoSubtitle');
    const showTitleBlock = state.get('showTitleBlock');

    this.innerHTML = `
      <label>
        <input type="checkbox" id="show-title-block" ${showTitleBlock ? 'checked' : ''}>
        Show title block on export
      </label>
      <label for="poster-title">Title</label>
      <input type="text" id="poster-title" placeholder="e.g. Roskilde" value="${title}">
      <label>
        <input type="checkbox" id="auto-subtitle" ${autoSubtitle ? 'checked' : ''}>
        Auto-generate coordinate subtitle
      </label>
      <label for="poster-subtitle">Subtitle</label>
      <input type="text" id="poster-subtitle" placeholder="e.g. 55.6415° N / 12.0803° E" value="${subtitle}" ${autoSubtitle ? 'disabled' : ''}>
    `;

    this.querySelector('#show-title-block').addEventListener('change', (ev) => {
      state.set('showTitleBlock', ev.target.checked);
    });
    this.querySelector('#poster-title').addEventListener('input', (ev) => {
      state.set('title', ev.target.value);
    });
    this.querySelector('#auto-subtitle').addEventListener('change', (ev) => {
      state.set('autoSubtitle', ev.target.checked);
      this.querySelector('#poster-subtitle').disabled = ev.target.checked;
    });
    this.querySelector('#poster-subtitle').addEventListener('input', (ev) => {
      state.set('subtitle', ev.target.value);
    });
  }
}
