const SEASONAL_THEMES = [
    {
        name: 'halloween',
        start: { month: 10, day: 1 },
        end: { month: 10, day: 31 }
    },
    {
        name: 'christmas',
        start: { month: 12, day: 1 },
        end: { month: 12, day: 31 }
    }
];

const PREVIEW_THEMES = new Set(['normal', ...SEASONAL_THEMES.map(({ name }) => name)]);
const SEASONAL_DECORATIONS = {
    halloween: [
        { kind: 'pumpkin', symbol: '🎃' },
        { kind: 'skeleton', symbol: '💀' },
        { kind: 'ghost', symbol: '👻' },
        { kind: 'pumpkin', symbol: '🎃' },
        { kind: 'spider', symbol: '🕷️' },
        { kind: 'bat', symbol: '🦇' },
        { kind: 'moon', symbol: '🌙' },
        { kind: 'candy', symbol: '🍬' },
        { kind: 'bat', symbol: '🦇' },
        { kind: 'spider', symbol: '🕷️' },
        { kind: 'ghost', symbol: '👻' }
    ],
    christmas: [
        ...Array.from({ length: 12 }, (_, index) => ({
            kind: 'snow',
            symbol: ['❄️', '❅', '❆'][index % 3]
        })),
        { kind: 'tree', symbol: '🎄' },
        { kind: 'santa', symbol: '🎅' },
        { kind: 'present', symbol: '🎁' },
        { kind: 'star', symbol: '⭐' },
        { kind: 'bell', symbol: '🔔' },
        { kind: 'reindeer', symbol: '🦌' },
        { kind: 'snowman', symbol: '☃️' },
        { kind: 'sparkle', symbol: '✨' }
    ]
};

export function getSeasonalTheme(date = new Date()) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const currentDate = month * 32 + day;

    return SEASONAL_THEMES.find(({ start, end }) => {
        const startDate = start.month * 32 + start.day;
        const endDate = end.month * 32 + end.day;

        return startDate <= endDate
            ? currentDate >= startDate && currentDate <= endDate
            : currentDate >= startDate || currentDate <= endDate;
    })?.name ?? 'normal';
}

function getDevelopmentPreview() {
    if (!import.meta.env.DEV) return null;

    const requestedTheme = new URLSearchParams(window.location.search).get('theme');
    return PREVIEW_THEMES.has(requestedTheme) ? requestedTheme : null;
}

let activeTheme = null;
let dateChangeTimer;

function applySeasonalTheme() {
    const nextTheme = getDevelopmentPreview() ?? getSeasonalTheme();
    if (nextTheme === activeTheme) return;

    activeTheme = nextTheme;
    const root = document.documentElement;
    const existingDecorations = document.querySelector('.seasonal-decorations');
    existingDecorations?.remove();

    if (activeTheme === 'normal') {
        root.removeAttribute('data-seasonal-theme');
        return;
    }

    root.dataset.seasonalTheme = activeTheme;
    const decorations = document.createElement('div');
    decorations.className = `seasonal-decorations seasonal-decorations--${activeTheme}`;
    decorations.setAttribute('aria-hidden', 'true');

    SEASONAL_DECORATIONS[activeTheme].forEach(({ kind, symbol }, index) => {
        const decoration = document.createElement('span');
        decoration.className = 'seasonal-decoration';
        decoration.textContent = symbol;
        decoration.dataset.decoration = String(index + 1);
        decoration.dataset.kind = kind;

        if (kind === 'snow') {
            const duration = 13 + Math.random() * 12;
            decoration.style.setProperty('--snow-left', `${Math.random() * 100}%`);
            decoration.style.setProperty('--snow-size', `${8 + Math.random() * 9}px`);
            decoration.style.setProperty('--snow-duration', `${duration}s`);
            decoration.style.setProperty('--snow-delay', `${-Math.random() * duration}s`);
            decoration.style.setProperty('--snow-drift', `${-24 + Math.random() * 48}px`);
        }

        decorations.append(decoration);
    });

    document.body.append(decorations);
}

function scheduleDateChange() {
    clearTimeout(dateChangeTimer);
    const now = new Date();
    const nextLocalDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    dateChangeTimer = setTimeout(() => {
        applySeasonalTheme();
        scheduleDateChange();
    }, nextLocalDay.getTime() - now.getTime() + 50);
}

applySeasonalTheme();
scheduleDateChange();
window.addEventListener('focus', applySeasonalTheme);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') applySeasonalTheme();
});
