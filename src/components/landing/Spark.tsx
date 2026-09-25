interface SparkProps {
  size?: number;
  className?: string;
}

/** Lam13 spark mark. */
const Spark = ({ size = 22, className = "text-accent" }: SparkProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 1 L14.6 9.4 L23 12 L14.6 14.6 L12 23 L9.4 14.6 L1 12 L9.4 9.4 Z" />
  </svg>
);

export default Spark;
