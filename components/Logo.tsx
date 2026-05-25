interface Props {
  className?: string;
}

// 品牌標誌：資產配置甜甜圈（藍/綠/靛三段）+ 上升趨勢線，呼應「投資組合視覺化」
export default function Logo({ className = 'w-8 h-8' }: Props) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Portfolio Visualizer"
    >
      <g fill="none" strokeWidth="3.4" strokeLinecap="round">
        <circle cx="16" cy="16" r="9.5" stroke="#3b82f6" strokeDasharray="24.2 35.5" transform="rotate(-90 16 16)" />
        <circle cx="16" cy="16" r="9.5" stroke="#22c55e" strokeDasharray="17.7 42.0" transform="rotate(67.8 16 16)" />
        <circle cx="16" cy="16" r="9.5" stroke="#6366f1" strokeDasharray="11.8 47.9" transform="rotate(186.7 16 16)" />
      </g>
      <path
        d="M11.3 19.2 L14.6 15.9 L17.8 17.6 L21 13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="21" cy="13" r="1.8" fill="#22c55e" />
    </svg>
  );
}
