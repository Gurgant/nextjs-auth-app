import React from 'react'
import { render } from '@testing-library/react'
import { GradientPageLayout } from '../gradient-page-layout'

describe('GradientPageLayout', () => {
  it('renders children correctly', () => {
    const { getByText } = render(
      <GradientPageLayout>
        <div>Test Content</div>
      </GradientPageLayout>
    )
    
    expect(getByText('Test Content')).toBeInTheDocument()
  })

  it('applies default gradient class', () => {
    const { container } = render(
      <GradientPageLayout>
        <div>Content</div>
      </GradientPageLayout>
    )
    
    const layoutDiv = container.firstChild
    expect(layoutDiv).toHaveClass('from-blue-50', 'via-white', 'to-purple-50')
    expect(layoutDiv).toHaveClass('min-h-[calc(100vh-4rem)]', 'bg-gradient-to-br')
  })

  it('applies custom gradient classes', () => {
    const { container } = render(
      <GradientPageLayout gradient="green-blue">
        <div>Content</div>
      </GradientPageLayout>
    )
    
    const layoutDiv = container.firstChild
    expect(layoutDiv).toHaveClass('from-green-50', 'via-white', 'to-blue-50')
  })

  it('applies purple-pink gradient', () => {
    const { container } = render(
      <GradientPageLayout gradient="purple-pink">
        <div>Content</div>
      </GradientPageLayout>
    )
    
    const layoutDiv = container.firstChild
    expect(layoutDiv).toHaveClass('from-purple-50', 'via-white', 'to-pink-50')
  })

  it('merges custom className', () => {
    const { container } = render(
      <GradientPageLayout className="py-12 px-4">
        <div>Content</div>
      </GradientPageLayout>
    )
    
    const layoutDiv = container.firstChild
    expect(layoutDiv).toHaveClass('py-12', 'px-4')
    // Should also have default classes
    expect(layoutDiv).toHaveClass('min-h-[calc(100vh-4rem)]')
  })

  it('combines gradient and custom className', () => {
    const { container } = render(
      <GradientPageLayout gradient="green-blue" className="py-8">
        <div>Content</div>
      </GradientPageLayout>
    )
    
    const layoutDiv = container.firstChild
    expect(layoutDiv).toHaveClass('from-green-50', 'via-white', 'to-blue-50')
    expect(layoutDiv).toHaveClass('py-8')
  })
})