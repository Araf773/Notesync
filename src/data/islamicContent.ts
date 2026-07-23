/**
 * Curated Qur'an & Hadith on knowledge, study, dhikr, and the path to Allah.
 *
 * These are inserted into notes as styled quote blocks (see EditorToolbar's
 * "Insert reminder" menu). Arabic is provided with an English translation and a
 * source reference. References use widely-accepted translations (Sahih
 * International for Qur'an; standard collections for Hadith).
 *
 * Not exhaustive — a hand-picked set chosen to be motivating at the top of a
 * study session or journal entry.
 */

export interface Reminder {
  arabic: string;
  translation: string;
  reference: string;
}

export interface ReminderCategory {
  key: string;
  label: string;
  items: Reminder[];
}

export const REMINDER_CATEGORIES: ReminderCategory[] = [
  {
    key: 'knowledge',
    label: 'Knowledge & Study',
    items: [
      {
        arabic: 'وَقُل رَّبِّ زِدْنِي عِلْمًا',
        translation: 'And say, "My Lord, increase me in knowledge."',
        reference: "Qur'an 20:114",
      },
      {
        arabic: 'قُلْ هَلْ يَسْتَوِي الَّذِينَ يَعْلَمُونَ وَالَّذِينَ لَا يَعْلَمُونَ',
        translation: 'Say, "Are those who know equal to those who do not know?"',
        reference: "Qur'an 39:9",
      },
      {
        arabic:
          'يَرْفَعِ اللَّهُ الَّذِينَ آمَنُوا مِنكُمْ وَالَّذِينَ أُوتُوا الْعِلْمَ دَرَجَاتٍ',
        translation:
          'Allah will raise those who have believed among you and those who were given knowledge, by degrees.',
        reference: "Qur'an 58:11",
      },
      {
        arabic: 'اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ',
        translation: 'Read in the name of your Lord who created.',
        reference: "Qur'an 96:1",
      },
      {
        arabic: 'طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَىٰ كُلِّ مُسْلِمٍ',
        translation: 'Seeking knowledge is an obligation upon every Muslim.',
        reference: 'Sunan Ibn Mājah 224',
      },
      {
        arabic:
          'مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ بِهِ طَرِيقًا إِلَى الْجَنَّةِ',
        translation:
          'Whoever travels a path in search of knowledge, Allah makes easy for him a path to Paradise.',
        reference: 'Ṣaḥīḥ Muslim 2699',
      },
    ],
  },
  {
    key: 'dhikr',
    label: 'Dhikr & Remembrance',
    items: [
      {
        arabic: 'أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ',
        translation: 'Unquestionably, by the remembrance of Allah hearts are assured.',
        reference: "Qur'an 13:28",
      },
      {
        arabic: 'فَاذْكُرُونِي أَذْكُرْكُمْ وَاشْكُرُوا لِي وَلَا تَكْفُرُونِ',
        translation: 'So remember Me; I will remember you. And be grateful to Me and do not deny Me.',
        reference: "Qur'an 2:152",
      },
      {
        arabic: 'يَا أَيُّهَا الَّذِينَ آمَنُوا اذْكُرُوا اللَّهَ ذِكْرًا كَثِيرًا',
        translation: 'O you who have believed, remember Allah with much remembrance.',
        reference: "Qur'an 33:41",
      },
      {
        arabic:
          'مَثَلُ الَّذِي يَذْكُرُ رَبَّهُ وَالَّذِي لَا يَذْكُرُ رَبَّهُ مَثَلُ الْحَيِّ وَالْمَيِّتِ',
        translation:
          'The example of the one who remembers his Lord and the one who does not is like the living and the dead.',
        reference: 'Ṣaḥīḥ al-Bukhārī 6407',
      },
      {
        arabic:
          'أَلَا أُنَبِّئُكُم بِخَيْرِ أَعْمَالِكُمْ وَأَزْكَاهَا عِندَ مَلِيكِكُمْ ... قَالَ ذِكْرُ اللَّهِ',
        translation:
          'Shall I not tell you of the best of your deeds, the purest to your Sovereign…? They said yes. He said: The remembrance of Allah.',
        reference: 'Jāmiʿ at-Tirmidhī 3377',
      },
    ],
  },
  {
    key: 'path',
    label: 'The Road to Allah',
    items: [
      {
        arabic: 'وَالَّذِينَ جَاهَدُوا فِينَا لَنَهْدِيَنَّهُمْ سُبُلَنَا',
        translation: 'And those who strive for Us — We will surely guide them to Our ways.',
        reference: "Qur'an 29:69",
      },
      {
        arabic: 'وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا • وَيَرْزُقْهُ مِنْ حَيْثُ لَا يَحْتَسِبُ',
        translation:
          'And whoever fears Allah — He will make for him a way out, and will provide for him from where he does not expect.',
        reference: "Qur'an 65:2–3",
      },
      {
        arabic: 'فَإِنَّ مَعَ الْعُسْرِ يُسْرًا • إِنَّ مَعَ الْعُسْرِ يُسْرًا',
        translation: 'For indeed, with hardship comes ease. Indeed, with hardship comes ease.',
        reference: "Qur'an 94:5–6",
      },
      {
        arabic: 'قَدْ أَفْلَحَ مَن زَكَّاهَا',
        translation: 'He has succeeded who purifies it (the soul).',
        reference: "Qur'an 91:9",
      },
      {
        arabic: 'فَإِذَا عَزَمْتَ فَتَوَكَّلْ عَلَى اللَّهِ',
        translation: 'And when you have decided, then rely upon Allah.',
        reference: "Qur'an 3:159",
      },
      {
        arabic: 'احْفَظِ اللَّهَ يَحْفَظْكَ ، احْفَظِ اللَّهَ تَجِدْهُ تُجَاهَكَ',
        translation:
          'Be mindful of Allah and He will protect you. Be mindful of Allah and you will find Him before you.',
        reference: 'Jāmiʿ at-Tirmidhī 2516',
      },
    ],
  },
];

/** Render a reminder as HTML for Tiptap insertion — a bordered quote block.
 *  Paragraph order is meaningful (Arabic / translation / reference) and is what
 *  the CSS styles against; the `data-reminder` attribute is preserved by the
 *  ReminderAttribute extension in NoteEditor. */
export function reminderToHtml(r: Reminder): string {
  return (
    `<blockquote data-reminder="true">` +
    `<p>${r.arabic}</p>` +
    `<p>${r.translation}</p>` +
    `<p>— ${r.reference}</p>` +
    `</blockquote><p></p>`
  );
}
