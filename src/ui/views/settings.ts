import { h, button, card, frag } from '../dom';
import { notice } from '../components';
import { MODEL_CHOICES } from '../../ai/llm';
import { tts } from '../../ai/tts';
import { store } from '../../store';
import type { ModelSize } from '../../store';
import { app, currentModelId, subscribe, updateSettings } from '../state';

function choiceRow(
  label: string,
  blurb: string,
  selected: boolean,
  onPick: () => void,
): HTMLElement {
  return h(
    'button',
    { class: `choice${selected ? ' choice--on' : ''}`, attrs: { type: 'button' }, onClick: onPick },
    h('span', { class: 'choice__label', text: label }),
    h('span', { class: 'choice__blurb', text: blurb }),
  );
}

function toggle(label: string, blurb: string, on: boolean, onChange: (next: boolean) => void): HTMLElement {
  return h(
    'label',
    { class: 'toggle' },
    h('input', {
      attrs: { type: 'checkbox', ...(on ? { checked: 'checked' } : {}) },
      onInput: (e) => onChange((e.target as HTMLInputElement).checked),
    }),
    h('span', { class: 'toggle__body' }, h('span', { class: 'toggle__label', text: label }), h('span', { class: 'toggle__blurb', text: blurb })),
  );
}

export function mount(container: HTMLElement): () => void {
  const render = () => {
    container.textContent = '';
    const caps = app.caps;
    const settings = app.settings;

    const sizes: ModelSize[] = ['small', 'balanced', 'large'];

    container.append(
      frag(
      h('h1', { class: 'view__title', text: 'Settings' }),

      card(
        h('h2', { text: 'Tutor model' }),
        h('p', { class: 'muted', text: 'Runs on the GPU through WebGPU. Changing this unloads the current model.' }),
        ...sizes.map((size) =>
          choiceRow(
            `${MODEL_CHOICES[size].label} · ~${MODEL_CHOICES[size].approxMB} MB`,
            MODEL_CHOICES[size].blurb,
            settings.modelSize === size,
            () => updateSettings({ modelSize: size }),
          ),
        ),
        h('p', { class: 'muted small', text: `Resolves to: ${currentModelId() ?? 'none available in this WebLLM build'}` }),
      ),

      card(
        h('h2', { text: 'Speech recognition' }),
        h('p', { class: 'muted', text: 'Whisper runs on-device. Bigger checkpoints are more accurate and slower on a phone.' }),
        choiceRow('Whisper tiny · ~40 MB', 'Fastest. Good enough to catch the wrong word or a missing syllable.', settings.asrModel === 'onnx-community/whisper-tiny', () =>
          updateSettings({ asrModel: 'onnx-community/whisper-tiny' }),
        ),
        choiceRow('Whisper base · ~80 MB', 'Noticeably better Mandarin. Slower on older phones.', settings.asrModel === 'onnx-community/whisper-base', () =>
          updateSettings({ asrModel: 'onnx-community/whisper-base' }),
        ),
        h('p', { class: 'muted', text: 'Run it on:' }),
        choiceRow('WebAssembly (default)', 'Works on every phone, including iPhones without WebGPU.', settings.asrDevice === 'wasm', () =>
          updateSettings({ asrDevice: 'wasm' }),
        ),
        choiceRow('WebGPU', 'Much faster where supported. Treat it as experimental.', settings.asrDevice === 'webgpu', () =>
          updateSettings({ asrDevice: 'webgpu' }),
        ),
        toggle(
          "Use the browser's built-in recogniser instead",
          'Fast and accurate, but on most phones it sends your voice to a server. It also stops working offline. Left off on purpose.',
          settings.useWebSpeechSTT,
          (next) => updateSettings({ useWebSpeechSTT: next }),
        ),
      ),

      card(
        h('h2', { text: 'Speaking' }),
        h('p', { class: 'muted', text: `Voice: ${app.tts.available ? app.tts.voiceName : 'not found'}` }),
        app.tts.available ? null : notice(app.tts.message, 'warn'),
        h('label', { class: 'slider' },
          h('span', { class: 'slider__label', text: `Model speaking speed: ${settings.speechRate.toFixed(2)}×` }),
          h('input', {
            attrs: { type: 'range', min: '0.5', max: '1.2', step: '0.05', value: String(settings.speechRate) },
            onInput: (e) => updateSettings({ speechRate: Number((e.target as HTMLInputElement).value) }),
          }),
        ),
        button('Test the voice', 'btn btn--ghost', () => void tts.speak('你好，我叫小文。', settings.speechRate)),
        toggle('Show pinyin', 'Turn off once you want to read characters only.', settings.showPinyin, (next) => updateSettings({ showPinyin: next })),
        toggle('Show English', 'Turn off for a harder reading exercise.', settings.showEnglish, (next) => updateSettings({ showEnglish: next })),
      ),

      card(
        h('h2', { text: 'What this phone can do' }),
        h('ul', { class: 'facts' },
          h('li', {}, h('span', { text: 'WebGPU' }), h('strong', { text: caps?.webgpu ? 'available' : 'unavailable' })),
          h('li', {}, h('span', { text: 'GPU' }), h('strong', { text: caps?.gpu || '—' })),
          h('li', {}, h('span', { text: 'shader-f16' }), h('strong', { text: caps?.shaderF16 ? 'yes' : 'no' })),
          h('li', {}, h('span', { text: 'CPU cores' }), h('strong', { text: String(caps?.cores ?? '—') })),
          h('li', {}, h('span', { text: 'Device memory' }), h('strong', { text: caps?.deviceMemoryGB ? `${caps.deviceMemoryGB} GB` : 'not reported' })),
          h('li', {}, h('span', { text: 'Storage quota' }), h('strong', { text: caps?.storageQuotaMB ? `${(caps.storageQuotaMB / 1000).toFixed(1)} GB` : 'unknown' })),
          h('li', {}, h('span', { text: 'Tutor model' }), h('strong', { text: app.model.state })),
          h('li', {}, h('span', { text: 'Speech model' }), h('strong', { text: app.speech.state })),
        ),
        caps && !caps.webgpu ? h('ul', { class: 'bullets' }, ...caps.blockers.map((b) => h('li', { text: b }))) : null,
        h('p', { class: 'muted small', text: 'On iPhone, Safari keeps a limited amount of site storage and may clear it. Adding the app to your home screen makes the storage far more durable.' }),
      ),

      card(
        h('h2', { text: 'Reset' }),
        h('p', { class: 'muted', text: 'Clears scores, chat history and settings. Downloaded models stay cached.' }),
        button('Erase my data', 'btn btn--danger', () => {
          store.resetAll();
          location.reload();
        }),
      ),
      ),
    );
  };

  render();
  return subscribe(render);
}
