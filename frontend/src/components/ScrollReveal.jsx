import { useEffect, useRef, useState } from 'react';

export default function ScrollReveal({
  children,
  as: Element = 'div',
  className = '',
  style = {},
  delay = 0,
  duration = 500,
  distance = 16,
  threshold = 0.12,
  once = true
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, once]);

  const mergedStyle = {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0px)' : `translateY(${distance}px)`,
    transition: `opacity ${duration}ms ease, transform ${duration}ms ease`,
    transitionDelay: `${delay}ms`,
    willChange: 'opacity, transform',
    ...style
  };

  return (
    <Element ref={ref} className={className} style={mergedStyle}>
      {children}
    </Element>
  );
}
