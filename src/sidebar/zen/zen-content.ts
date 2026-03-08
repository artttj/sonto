export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const ZEN_INITIAL_BATCH = 3;
export const ZEN_DRIP_BATCH = 1;
export const ZEN_DRIP_MS = 30000;
export const ZEN_IDLE_MS = 5 * 60 * 1000;
export const ZEN_MAX_CATCHUP = 6;
export const ZEN_MAX_BUBBLES = 20;

export const SVG_BULB = [
  '<svg class="zen-bulb" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">',
  '<circle cx="8" cy="6" r="4"/>',
  '<path d="M6.5 10v1.5a1.5 1.5 0 0 0 3 0V10" stroke-linecap="round"/>',
  '<path d="M8 14v.5" stroke-linecap="round"/>',
  '</svg>',
].join('');

export const SVG_CHALLENGE = [
  '<svg class="zen-bulb zen-bulb--challenge" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">',
  '<line x1="5" y1="3" x2="5" y2="13"/>',
  '<path d="M5 3 L11 5.5 L5 8"/>',
  '</svg>',
].join('');

export const SVG_AFFIRM = [
  '<svg class="zen-bulb zen-bulb--affirm" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M8 14 V9"/>',
  '<path d="M8 12 C8 12 5 11 4.5 8 C7 7.5 8 10 8 12"/>',
  '<path d="M8 9 C8 9 11 8 11.5 5 C9 4.5 8 7 8 9"/>',
  '</svg>',
].join('');

export const SVG_QUOTE = [
  '<svg class="zen-bulb zen-bulb--quote" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M3.5 10 C3.5 10 2 8 3 6 C3.5 6 5 6 5 7.5 C5 9 3.5 9.5 3.5 10"/>',
  '<path d="M9 10 C9 10 7.5 8 8.5 6 C9 6 10.5 6 10.5 7.5 C10.5 9 9 9.5 9 10"/>',
  '</svg>',
].join('');

export const CHALLENGES: string[] = [
  'Sit in silence for 12 minutes and write the first three images that appear in your mind.',
  'Walk a route you always avoid, notice three small details you have never seen before.',
  'For one hour, refuse every digital notification, then list what came to mind first.',
  'Create a one minute ritual for leaving any room, repeat it every time for a day.',
  'Write a 150 word letter to your future self about a small daily habit, postdate it one year.',
  'Spend 10 minutes naming sensations from head to toe without judging them.',
  'Swap one of your usual opinions for curiosity, ask one probing question about why you believe it.',
  'Replace one complaint with a concrete action and perform that action within 24 hours.',
  'Collect five images or words that calm you, arrange them into a single phone wallpaper.',
  'Cook one simple meal without a recipe and take two photos, one during, one after, noting a surprise.',
  'Pause before every meal today, breathe three times, taste each bite as if you had never had it.',
  'For one evening, use only paper notes for planning, no apps, then reflect on differences.',
  'Send a handwritten postcard to someone who will not expect it.',
  'Choose a small fear, take one measurable step toward it, celebrate the attempt regardless of outcome.',
  'Spend 20 minutes reading a single paragraph slowly, then summarize it in one sentence.',
  'Observe your surroundings for five minutes and list ten sounds you normally ignore.',
  'Write down one belief you hold strongly and imagine the best argument against it.',
  'Drink a glass of water slowly, noticing temperature, weight, and taste.',
  'Rearrange a small area of your workspace to remove one distraction.',
  'Ask someone a thoughtful question and listen without interrupting.',
  'Take a photo of something ordinary that suddenly looks beautiful.',
  'Spend ten minutes stretching slowly while breathing deliberately.',
  'Read one page of a book aloud to hear the rhythm of the words.',
  'Write three sentences describing the weather as if you were a poet.',
  'Choose a familiar object and describe it in detail as if you were seeing it for the first time.',
  'Step outside for two minutes and notice the direction of the wind.',
  'Do one task today half as fast as usual, observe how it changes your attention.',
  'Look at an old photo and write down the first memory it brings back.',
  'Spend five minutes noticing your posture and gently adjusting it.',
  'Close your eyes for one minute and imagine the place where you feel most peaceful.',
];

export const AFFIRMATIONS_PREDEFINED: string[] = [
  'I am allowed to change my mind, and that is a sign of growth.',
  'Quiet attention brings clarity, and I can give myself that gift.',
  'My worth is not equal to my productivity, it is equal to my presence.',
  'Small steady choices build honest character, I trust the accumulation.',
  'I can hold discomfort and still be kind to myself.',
  'Curiosity will steer me farther than certainty ever could.',
  'I create space for what matters by letting go of what does not.',
  'I am learning the language of my own limits, I listen without shame.',
  'I do not have to fix everything to be enough where I am.',
  'Each slow breath is a return to what is real and useful.',
  'I choose depth over breadth when my energy asks for it.',
  'Silence is not empty, it is where my clarity grows.',
  'I practice noticing without needing to act immediately.',
  'I keep one quiet commitment that belongs only to me.',
  'I will meet this moment with honest effort, not perfection.',
  'I trust my ability to begin again whenever I need to.',
  'I allow patience to guide the pace of my progress.',
  'My attention is valuable, I spend it carefully.',
  'I welcome small improvements that accumulate quietly.',
  'I accept that rest is part of meaningful effort.',
  'I learn something useful from each thoughtful pause.',
  'My focus grows stronger each time I bring it back gently.',
  'I choose clarity over urgency when possible.',
  'I can observe my thoughts without becoming them.',
  'I respect the rhythm of my energy and adjust with kindness.',
  'My calm is built through practice, not chance.',
  'I allow curiosity to replace unnecessary worry.',
  'Each step forward counts, even when it feels small.',
  'I remain open to insight that arrives slowly.',
  'I bring steady attention to what truly matters today.',
];

export const QUOTES_PREDEFINED: string[] = [
  'Calm is not absence of motion, it is the skill of steering the smallest boat well.',
  'A clear day is practice for a clearer mind, both require attention to weather.',
  'The willing pause is an act of courage disguised as leisure.',
  'Notes of gratitude rearrange the same day into a different song.',
  'To be still is not to stagnate, it is to tune the instrument before playing.',
  'We mistake speed for progress until a slow step reveals new ground.',
  'A single steady habit is a map that outlives a thousand intentions.',
  'Listening well is the quiet work of keeping a conversation alive.',
  'Curiosity is the flashlight that finds doors disappointment closed.',
  'The smallest honesty clears more future than the grandest excuse.',
  'Practice collects the edges of a life into a shape you can recognize.',
  'Solitude is a studio where the soul learns to paint with silence.',
  'The mind prefers drama, the heart prefers truth, learn to invite both gently.',
  'A gentle refusal can be the kindest gift to your next self.',
  'Habit without reflection is a road without a map.',
  'Attention curates reality, spend it like a careful collector.',
  'The value of a day is measured in moments returned to later.',
  'Beauty often hides in the seams between ordinary things.',
  'A steady question will unravel answers faster than forced searching.',
  'Presence is the practice of bringing your hand back to the same work, again and again.',
  'The quiet mind notices paths the hurried mind walks past.',
  'Progress is rarely loud, it grows like roots beneath the soil.',
  'A thoughtful pause can prevent a thousand unnecessary steps.',
  'Depth begins where distraction ends.',
  'A good habit is a small promise kept repeatedly.',
  'The mind sharpens when it learns to rest between efforts.',
  'Reflection turns experience into understanding.',
  'Calm attention reveals what noise tries to hide.',
  'Wisdom grows where patience and curiosity meet.',
  'The simplest moments often carry the most honest clarity.',
];

export const AI_PATTERNS = [
  /\b(artificial intelligence|machine learning|deep learning|neural network|large language model|llm|gpt-?\d|chatgpt|copilot|chatbot|generative ai|diffusion model|prompt engineering|fine.?tun(ing)?)\b/i,
];

export const BLOCKED_CATEGORY_PATTERNS = [
  /\b(ai|artificial intelligence|machine learning|deep learning|llm|large language model|chatbot|generative|prompt engineering|ai.driven|ai.powered|ai.based|neural network)\b/i,
  /\b(adult|porn|pornograph|explicit|erotic|escort|sex|xxx|onlyfans)\b/i,
  /\b(cannabis|hashish|weed|drug|marijuana|cocaine|narcotic|psychedelic|substance abuse)\b/i,
  /\b(food delivery|ride.?hail|grocery|uber|doordash|restaurant|takeaway|takeout|local service|banking app|subscription service)\b/i,
  /\b(social media|instagram|tiktok|facebook|twitter|youtube|streaming|content creation|video platform|twitch)\b/i,
];
