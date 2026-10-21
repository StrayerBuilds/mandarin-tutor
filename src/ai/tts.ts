/**
 * Speech output through the phone's own text-to-speech engine.
 *
 * No network, no audio files to download: Android and iOS both ship a Mandarin
 * voice. Some Android phones need the Chinese voice data installed once in
 * Settings → Text-to-speech, so the app checks and tells the learner when the
 * voice is missing instead of silently doing nothing. An English voice is picked
 * too, so 小文 can lead in English and then give the Chinese in a different voice.
 */
export interface TtsStatus {
  available: boolean;
  voiceName: string | null;
  message: string;
}

const PREFERRED = /tingting|meijia|sinji|yaoyao|huihui|xiaoxiao|yunxi|普通话|中文|chinese|mandarin/i;
const PREFERRED_EN = /samantha|serena|daniel|karen|moira|tessa|aria|jenny|zira|natural|google us english/i;

/** Which half of a bilingual tutor is talking. */
export type VoiceLang = 'zh' | 'en';

function allVoices(): SpeechSynthesisVoice[] {
  try {
    return speechSynthesis.getVoices();
  } catch {
    return [];
  }
}

function pickVoice(lang: VoiceLang = 'zh'): SpeechSynthesisVoice | null {
  const voices = allVoices();
  const wanted =
    lang === 'zh'
      ? voices.filter((v) => /^zh/i.test(v.lang) || /zh[-_]?(CN|Hans|SG)/i.test(v.lang))
      : voices.filter((v) => /^en/i.test(v.lang));

  // No English voice installed: the Mandarin one still reads English acceptably.
  if (wanted.length === 0) return lang === 'zh' ? null : pickVoice('zh');

  const local = wanted.filter((v) => v.localService);
  const pool = local.length > 0 ? local : wanted;
  const preferred = lang === 'zh' ? PREFERRED : PREFERRED_EN;
  return pool.find((v) => preferred.test(v.name)) ?? pool[0];
}

export const tts = {
  status(): TtsStatus {
    if (!('speechSynthesis' in window)) {
      return { available: false, voiceName: null, message: 'This browser has no speech synthesis.' };
    }
    const voice = pickVoice();
    if (!voice) {
      return {
        available: false,
        voiceName: null,
        message:
          'No Mandarin voice found. Install a Chinese voice: Android → Settings → System → Languages → Text-to-speech; iOS → Settings → Accessibility → Spoken Content → Voices → Chinese.',
      };
    }
    return {
      available: true,
      voiceName: `${voice.name}${voice.localService ? ' (on device)' : ' (may use data)'}`,
      message: 'Speaks through your phone, not the internet.',
    };
  },

  /** Voices load asynchronously in Chrome; resolves once a Mandarin voice shows up. */
  ready(): Promise<TtsStatus> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve(this.status());
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(this.status());
      };
      const first = this.status();
      if (first.available) {
        finish();
        return;
      }
      const onChange = () => {
        if (this.status().available) {
          speechSynthesis.removeEventListener('voiceschanged', onChange);
          finish();
        }
      };
      speechSynthesis.addEventListener('voiceschanged', onChange);
      setTimeout(() => {
        speechSynthesis.removeEventListener('voiceschanged', onChange);
        finish();
      }, 2000);
    });
  },

  /**
   * iOS only allows speech in a gesture's call stack the first time, so the app
   * calls this from the first tap to unlock the engine.
   */
  unlock(): void {
    if (!('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      u.lang = 'zh-CN';
      speechSynthesis.speak(u);
    } catch {
      // Nothing to unlock.
    }
  },

  cancel(): void {
    try {
      speechSynthesis.cancel();
    } catch {
      // ignore
    }
  },

  /** @param opts.lang which half of the bilingual tutor is talking. */
  speak(text: string, rate = 0.85, opts: { pitch?: number; lang?: VoiceLang } = {}): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window) || !text.trim()) {
        resolve();
        return;
      }
      const lang = opts.lang ?? 'zh';
      const voice = pickVoice(lang);
      if (!voice) {
        resolve();
        return;
      }

      try {
        speechSynthesis.cancel();
      } catch {
        // ignore
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang || (lang === 'en' ? 'en-US' : 'zh-CN');
      utterance.rate = rate;
      utterance.pitch = opts.pitch ?? 1;

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      // Some Android builds never fire onend; don't hang the UI forever.
      const guard = Math.min(20000, 1500 + text.length * 420);
      setTimeout(finish, guard);

      try {
        speechSynthesis.speak(utterance);
      } catch {
        finish();
      }
    });
  },
};
