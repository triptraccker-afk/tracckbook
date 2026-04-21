/* React import removed to avoid default import issues */

const motionProxy = new Proxy({}, {
  get: (_target, prop) => {
    // Return a component that just renders the tag
    return (props: any) => {
      const { children, initial, animate, exit, transition, ...rest } = props;
      const Tag = prop as any;
      return <Tag {...rest}>{children}</Tag>;
    };
  }
});

export const motion = motionProxy as any;
export const AnimatePresence = ({ children }: any) => <>{children}</>;
