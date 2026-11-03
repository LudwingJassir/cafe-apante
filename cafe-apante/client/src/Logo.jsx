// Logo de Café Apante redibujado en vectores a partir del arte del empaque: se ve nítido en cualquier tamaño.
import '@fontsource/montserrat/700.css';
import { useId } from 'react';

export const VERDE_APANTE = '#1e5631';
export const CAFE_APANTE = '#4b2e1a';

/** Montañas con nieve (la «A» de Apante) y el grano de café. Mismas coordenadas en ambas variantes. */
function Simbolo({ idMascara }) {
  return (
    <>
      <path
        d="M3.3 130.8 55.5 36.7 70 61.3 102 2.5l31.3 59.2-15 20.3L102 55 82.5 87.5l32.8.5-2.3 17H86.7l14.1 25.8H63.7l14.6-25.5h-5l-14.1 25.5Z"
        fill={VERDE_APANTE}
      />
      <path d="M55.5 54.2 69.7 78.3l-8-2-5.9 8.7-5.8-8.7-8.3 2.9ZM102 20l14.7 25.8-11.4-3.8-4 8-5-8-9.3 3.3Z" fill="#fff" />
      <mask id={idMascara}>
        <ellipse cx="162.5" cy="95.8" rx="35" ry="41.5" transform="rotate(12.5 162.5 95.8)" fill="#fff" />
        <path d="M193 55c-18 13-29 25-31 39s-12 27-30 42" fill="none" stroke="#000" strokeWidth="6.5" />
      </mask>
      <rect x="120" y="50" width="85" height="92" fill={CAFE_APANTE} mask={`url(#${idMascara})`} />
    </>
  );
}

/**
 * Sin texto queda solo el símbolo, para espacios pequeños.
 * @param {{ conTexto?: boolean, className?: string }} props
 */
export default function Logo({ conTexto = true, className = '' }) {
  const idMascara = `grano-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox={conTexto ? '0 0 430 138' : '0 0 202 138'} className={className} role="img" aria-label="Café Apante">
      <Simbolo idMascara={idMascara} />
      {conTexto && (
        <g fill={CAFE_APANTE} fontFamily="Montserrat, 'Segoe UI', sans-serif" fontWeight="700" fontSize="50" aria-hidden>
          <text x="217" y="75.5" textLength="137" lengthAdjust="spacing">
            CAFÉ
          </text>
          <text x="216" y="127.5" textLength="211" lengthAdjust="spacing">
            APANTE
          </text>
        </g>
      )}
    </svg>
  );
}
