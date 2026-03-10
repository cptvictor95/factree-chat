import type { JSX } from 'react';
import { motion } from 'framer-motion';

export interface JoinSplashProps {
  onJoin: () => void;
}

export function JoinSplash({ onJoin }: JoinSplashProps): JSX.Element {
  return (
    <motion.div
      className="join-splash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="join-splash-content">
        <motion.div
          className="join-vinyl"
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          aria-hidden="true"
        />
        <h1 className="join-logo">factree.fm</h1>
        <p className="join-tagline">Your private listening room</p>
        <motion.button
          className="join-btn"
          onClick={onJoin}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
        >
          Join the room →
        </motion.button>
      </div>
    </motion.div>
  );
}
