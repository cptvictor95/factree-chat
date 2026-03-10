import { useMemo } from 'react';
import type { JSX } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { tables, reducers } from '../../module_bindings';
import type * as Types from '../../module_bindings/types';
import { AddToQueueForm } from './AddToQueueForm';

const itemVariants = {
  hidden: { opacity: 0, y: 8, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: 'easeOut' as const } },
  exit: { opacity: 0, scale: 0.93, transition: { duration: 0.15 } },
};

const containerVariants = {
  visible: {
    transition: { staggerChildren: 0.07 },
  },
};

interface QueueItemRowProps {
  item: Types.QueueItem;
  isOwn: boolean;
  onRemove: (id: bigint) => void;
}

function QueueItemRow({ item, isOwn, onRemove }: QueueItemRowProps): JSX.Element {
  return (
    <motion.div className="queue-item" variants={itemVariants} layout layoutId={item.id.toString()}>
      <span className="queue-item-position">#{item.position}</span>
      <img src={item.thumbnailUrl} alt={item.title} className="queue-item-thumb" />
      <div className="queue-item-meta">
        <p className="queue-item-title">{item.title}</p>
        <p className="queue-item-by">
          {isOwn ? 'you' : item.addedBy.toHexString().substring(0, 8)}
        </p>
      </div>
      <button
        className="queue-item-remove"
        onClick={() => onRemove(item.id)}
        aria-label={`Remove ${item.title} from queue`}
        title="Remove from queue"
      >
        ✕
      </button>
    </motion.div>
  );
}

export function QueuePanel(): JSX.Element {
  const [queueItems] = useTable(tables.queue_item);
  const { identity } = useSpacetimeDB();
  const removeFromQueue = useReducer(reducers.removeFromQueue);

  const sorted = useMemo(
    () => [...queueItems].sort((a, b) => a.position - b.position),
    [queueItems]
  );

  const handleRemove = (queueItemId: bigint): void => {
    removeFromQueue({ queueItemId });
  };

  return (
    <div className="queue-panel">
      <div className="queue-header">
        <h2 className="queue-title">Up Next</h2>
        <span className="queue-count">
          {sorted.length} {sorted.length === 1 ? 'song' : 'songs'}
        </span>
      </div>

      <motion.div
        className="queue-list"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {sorted.length === 0 ? (
          <p className="queue-empty">Queue is empty — add a song below!</p>
        ) : (
          <AnimatePresence mode="popLayout">
            {sorted.map(item => (
              <QueueItemRow
                key={item.id.toString()}
                item={item}
                isOwn={!!identity && item.addedBy.isEqual(identity)}
                onRemove={handleRemove}
              />
            ))}
          </AnimatePresence>
        )}
      </motion.div>

      <AddToQueueForm />
    </div>
  );
}
