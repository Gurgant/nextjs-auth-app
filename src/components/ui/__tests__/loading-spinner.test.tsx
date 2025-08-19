import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '../loading-spinner';

describe('LoadingSpinner', () => {
  it('renders with default props', () => {
    const { container } = render(<LoadingSpinner />);
    const svg = container.querySelector('svg');
    
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('animate-spin', 'h-5', 'w-5', 'text-blue-600');
    expect(svg).toHaveAttribute('aria-label', 'Loading...');
    expect(svg).toHaveAttribute('role', 'status');
  });

  it('renders with custom size', () => {
    const { container } = render(<LoadingSpinner size="xl" />);
    const svg = container.querySelector('svg');
    
    expect(svg).toHaveClass('h-8', 'w-8');
  });

  it('renders with custom color', () => {
    const { container } = render(<LoadingSpinner color="white" />);
    const svg = container.querySelector('svg');
    
    expect(svg).toHaveClass('text-white');
  });

  it('renders with custom className', () => {
    const { container } = render(<LoadingSpinner className="-ml-1 mr-3" />);
    const svg = container.querySelector('svg');
    
    expect(svg).toHaveClass('-ml-1', 'mr-3');
  });

  it('renders with custom label for accessibility', () => {
    const { container } = render(<LoadingSpinner label="Processing payment..." />);
    const svg = container.querySelector('svg');
    
    expect(svg).toHaveAttribute('aria-label', 'Processing payment...');
  });

  it('combines all props correctly', () => {
    const { container } = render(
      <LoadingSpinner 
        size="sm" 
        color="secondary" 
        className="custom-class" 
        label="Custom loading"
      />
    );
    const svg = container.querySelector('svg');
    
    expect(svg).toHaveClass('h-4', 'w-4', 'text-purple-600', 'custom-class');
    expect(svg).toHaveAttribute('aria-label', 'Custom loading');
  });
});