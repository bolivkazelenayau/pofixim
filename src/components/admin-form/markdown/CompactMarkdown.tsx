'use client';

import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { renderEditorMarkdown } from './formatting';

type CompactMarkdownProps = {
  children: string;
  className?: string;
  inline?: boolean;
};

function CompactMarkdown({ children, className = '', inline = false }: CompactMarkdownProps) {
  const markdown = useMemo(() => renderEditorMarkdown(children), [children]);
  const Wrapper = inline ? 'span' : 'div';

  return (
    <Wrapper
      className={`${inline ? '[&_p]:inline [&_p]:m-0' : '[&_p]:m-0'} [&_strong]:font-bold [&_em]:italic ${className}`}
    >
      <ReactMarkdown rehypePlugins={[rehypeRaw]}>{markdown}</ReactMarkdown>
    </Wrapper>
  );
}

export default memo(CompactMarkdown);
