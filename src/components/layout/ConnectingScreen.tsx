import type { JSX } from 'react';
import { motion } from 'framer-motion';

export function ConnectingScreen(): JSX.Element {
  return (
    <motion.div
      className="connecting"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.span
        className="connecting-logo"
        animate={{ opacity: [1, 0.35, 1] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        factree.fm
      </motion.span>
      <p className="connecting-text">Connecting to the room…</p>
    </motion.div>
  );
}
