import React from 'react'
import { render } from '@testing-library/react'
import { LoadingLayout } from '../loading-layout'

// Mock LoadingSpinner component
jest.mock('@/components/ui/loading-spinner', () => ({
  LoadingSpinner: ({ size, color }: any) => (
    <div data-testid="loading-spinner" data-size={size} data-color={color}>
      Loading Spinner
    </div>
  )
}))

describe('LoadingLayout', () => {
  it('renders with default props', () => {
    const { getByText, getByTestId } = render(
      <LoadingLayout />
    )
    
    // Should show default message
    expect(getByText('Loading...')).toBeInTheDocument()
    
    // Should render spinner with default size
    const spinner = getByTestId('loading-spinner')
    expect(spinner).toHaveAttribute('data-size', 'lg')
    expect(spinner).toHaveAttribute('data-color', 'primary')
  })

  it('renders custom message', () => {
    const { getByText } = render(
      <LoadingLayout message="Processing your request..." />
    )
    
    expect(getByText('Processing your request...')).toBeInTheDocument()
  })

  it('renders without message when message is empty', () => {
    const { queryByText } = render(
      <LoadingLayout message="" />
    )
    
    // Should not render the paragraph element
    expect(queryByText('Loading...')).not.toBeInTheDocument()
  })

  it('applies default layout classes', () => {
    const { container } = render(
      <LoadingLayout />
    )
    
    const layoutDiv = container.firstChild
    expect(layoutDiv).toHaveClass('flex', 'items-center', 'justify-center')
    expect(layoutDiv).toHaveClass('min-h-[calc(100vh-4rem)]')
    expect(layoutDiv).toHaveClass('bg-gray-50')
  })

  it('applies fullScreen layout', () => {
    const { container } = render(
      <LoadingLayout fullScreen />
    )
    
    const layoutDiv = container.firstChild
    expect(layoutDiv).toHaveClass('min-h-screen')
    expect(layoutDiv).not.toHaveClass('min-h-[calc(100vh-4rem)]')
  })

  it('passes custom spinnerSize', () => {
    const { getByTestId } = render(
      <LoadingLayout spinnerSize="xl" />
    )
    
    const spinner = getByTestId('loading-spinner')
    expect(spinner).toHaveAttribute('data-size', 'xl')
  })

  it('merges custom className', () => {
    const { container } = render(
      <LoadingLayout className="bg-blue-100" />
    )
    
    const layoutDiv = container.firstChild
    expect(layoutDiv).toHaveClass('bg-blue-100')
    // Should still have default classes
    expect(layoutDiv).toHaveClass('flex', 'items-center', 'justify-center')
  })

  it('combines all props correctly', () => {
    const { container, getByText, getByTestId } = render(
      <LoadingLayout 
        message="Custom loading message"
        fullScreen
        spinnerSize="sm"
        className="custom-bg"
      />
    )
    
    // Check layout classes
    const layoutDiv = container.firstChild
    expect(layoutDiv).toHaveClass('min-h-screen', 'custom-bg')
    
    // Check message
    expect(getByText('Custom loading message')).toBeInTheDocument()
    
    // Check spinner size
    const spinner = getByTestId('loading-spinner')
    expect(spinner).toHaveAttribute('data-size', 'sm')
  })

  it('has correct text styling for message', () => {
    const { getByText } = render(
      <LoadingLayout message="Test message" />
    )
    
    const messageElement = getByText('Test message')
    expect(messageElement).toHaveClass('mt-2', 'text-gray-600')
  })
})