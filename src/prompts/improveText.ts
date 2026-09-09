import type { ImproveAction, Language } from '../types/domain'
import { clampText, jsonInstruction, styleFor, type PromptSpec } from './shared'

export interface ImproveTextInput {
  text: string
  actions: ImproveAction[]
  language?: Language
}

const SHAPE = `{
  "improved": string,
  "changeSummary": string[],
  "language": "ar" | "en"
}`

const ACTION_RULES: Record<ImproveAction, string> = {
  proofread: 'صحّح الأخطاء الإملائية والنحوية وعلامات الترقيم دون تغيير المعنى أو الأسلوب.',
  more_formal: 'ارفع درجة الرسمية: استبدل الألفاظ العامية أو المحكية بصياغة مؤسسية، ووسّع المقدمة والخاتمة بما يناسب خطابًا رسميًا.',
  more_diplomatic: 'خفّف حدة العبارات، واستبدل الاتهام والمباشرة الجارحة بصياغة محايدة مهنية تحفظ العلاقة مع المخاطَب.',
  more_firm: 'ارفع درجة الحزم بوضوح مهني: حدّد المطلوب والمهلة صراحة وأشر إلى الأثر المترتب على التأخير، دون أي تهديد أو إساءة.',
  shorten: 'اختصر النص بنسبة لا تقل عن ٤٠٪ مع الحفاظ على كل النقاط الجوهرية والمواعيد.',
  simplify: 'بسّط التراكيب والجمل الطويلة إلى جمل قصيرة مباشرة مع الحفاظ على الرسمية.',
  clarify: 'حسّن الوضوح: اجعل المطلوب في جملة مستقلة صريحة، ورتّب الأفكار ترتيبًا منطقيًا.',
  full_rewrite: 'أعد صياغة النص بالكامل ببنية مؤسسية سليمة (مرجع → سياق → المطلوب → الموعد → خاتمة) مع الحفاظ على المعنى والحقائق.',
}

export function buildImproveTextPrompt(input: ImproveTextInput): PromptSpec {
  const language = input.language ?? 'ar'
  const actions = input.actions.length ? input.actions : (['proofread'] as ImproveAction[])

  const system = [
    'أنت محرر مراسلات مؤسسية محترف.',
    'مهمتك: تحسين نص موجود وفق الإجراءات المطلوبة، مع الحفاظ التام على الحقائق والأسماء والأرقام والمواعيد الواردة فيه.',
    styleFor(language),
    'الإجراءات المطلوبة (طبّقها جميعًا معًا):',
    actions.map((a) => `- ${ACTION_RULES[a]}`).join('\n'),
    'قواعد إلزامية:',
    '- لا تضف معلومات أو التزامات جديدة غير موجودة في النص الأصلي.',
    '- لا تحذف أي طلب أو موعد ورد في النص الأصلي (إلا إذا كان تكرارًا حرفيًا).',
    '- "improved" النص النهائي جاهز للنسخ، بدون Markdown وبدون تعليق.',
    '- "changeSummary" من ٣ إلى ٦ نقاط قصيرة تشرح ما تغيّر ولماذا.',
    '- حافظ على لغة النص الأصلي ما لم يُطلب غير ذلك.',
    jsonInstruction(SHAPE),
  ].join('\n\n')

  const user = ['النص الأصلي:', '"""', clampText(input.text, 12000), '"""'].join('\n')

  return { system, user, temperature: 0.35, json: true }
}
