/* logo.jsx — Aldo Carrera signature mark
   Inline SVG so it inherits color via currentColor. Used in sidebar, menubar,
   mobile header, and To-Go Deck cover/footer. */

const AldoLogo = ({ size = 28, fill = 'currentColor', className }) => (
  <svg
    className={className}
    width={size}
    height={size * (326.97 / 452.33)}
    viewBox="0 0 452.33 326.97"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Aldo Carrera"
    role="img"
    style={{ display: 'block', flexShrink: 0 }}
  >
    <g fill={fill}>
      <path d="M251.26,311.81c-20.41,8.99-48.31,8.03-59.87-14.11-3.88-7.43-4.92-15.21-4.91-24.26-28,6.38-54.77,14.5-81.4,23.53-10.5,9.27-20.26,17.42-31.89,24.47-4.87,2.95-18.4,8.75-21.77,3.24-2.27-3.72,6.89-2.89,12.74-6.42,7.4-4.46,13.68-9.24,20.25-15.1-18.34,4.45-35,7.75-52.8,3.75-14.35-3.23-27.04-12.81-30.24-27.52-6.87-31.59,12.98-70.87,32.17-95.53,15.62-20.07,32.69-38.17,52.33-54.57,50.52-42.21,106.49-76.75,167.47-101.79,30.55-12.55,61.52-22.08,94.23-26.43,13.49-1.79,26.57-.99,39.93-.02,34.53,2.49,65.67,22.9,64.81,60.77-.25,10.94-.59,21.08-3.28,31.67-4.9,19.24-12.69,36.69-23.4,53.4-24.1,37.6-57.61,70.29-90.29,101.9,19.86,5.47,32.69,19.49,44.84,34.78,1.96,4.43,3.9,8.77,1.29,13.54-9.81-11.63-19.66-21.92-31.22-31.04-6.8-5.37-14.96-8.03-23.84-9.12-23,20.31-47.01,42.47-75.16,54.87ZM288.73,93.35c-17.55,32.15-41.56,59.54-65.09,87.17-12.36,24.44-24.62,53.23-27.1,80.91,42.52-8.01,83.23-15.3,126.23-14.22,21.63-20.25,42.32-40.86,62.18-63.07,24.4-27.28,45.62-57.44,54.77-93.16,2.72-10.6,3.21-21.17,3.01-32.08-.34-18.78-11.06-33.95-27.93-41.53-13.41-6.02-27.38-7.56-42.21-7.97-17.07-.47-32.64,1.25-49.42,5.09-79.68,18.25-160.19,63.3-223.49,114.65-22.48,18.24-42.51,37.93-59.91,61.03-17.21,22.85-36,57.87-29.98,87.1,5.24,25.4,42.05,25.42,60.93,19.83l31.69-9.38,53.1-49.69c21.52-20.14,40.85-41.1,60.46-63.26,13.85-27.22,29.55-52.33,48.79-75.85,4.66-5.69,16.4-20.8,22.94-14.57,2.02,1.92,2.76,5.82,1.02,9ZM187.17,263.37c.79-20.75,7.81-38.58,13.74-57.35l-75.13,73.61,61.39-16.25ZM270.64,290.13c14.59-10.25,27.74-21.11,41.11-33.3-7.4-.29-13.77-.21-21.05.38-32.05,2.61-63.05,7.3-94.38,14.11-1.93,14.53,3.54,30.15,18.01,34.65,20.12,6.25,39.79-4.22,56.32-15.84Z"/>
      <path d="M367.54,313.59c-.39,2.14-6.52,2.45-10.33-5.47-2.03-4.21.38-9,4.14-10.1,2.35,10.4,7.2,10.04,6.2,15.57Z"/>
    </g>
  </svg>
);

/* Hand-drawn signature wordmark. Uses mask-image so it tints with currentColor
   or any color passed via `fill`. Size sets the HEIGHT; width follows aspect. */
const SIG_ASPECT = 3292 / 1227; // ≈ 2.683

const AldoSignature = ({ height = 28, fill = 'currentColor', className, style }) => (
  <span
    className={className}
    role="img"
    aria-label="Aldo Carrera"
    style={{
      display: 'inline-block',
      width: height * SIG_ASPECT,
      height,
      backgroundColor: fill,
      WebkitMaskImage: 'url("aldo-signature.png")',
      maskImage: 'url("aldo-signature.png")',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskPosition: 'left center',
      maskPosition: 'left center',
      flexShrink: 0,
      ...style,
    }}
  />
);

window.AldoLogo = AldoLogo;
window.AldoSignature = AldoSignature;
