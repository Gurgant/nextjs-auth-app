import { render, screen, fireEvent } from '@testing-library/react';
import { AlertMessage } from '../alert-message';

describe('AlertMessage', () => {
  it('renders success alert correctly', () => {
    render(<AlertMessage type="success" message="Operation successful!" />);
    
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveClass('bg-green-50', 'border-green-200');
    expect(screen.getByText('Operation successful!')).toHaveClass('text-green-700');
    
    // Check for success icon
    const svg = alert.querySelector('svg');
    expect(svg).toHaveClass('text-green-400');
  });

  it('renders error alert correctly', () => {
    render(<AlertMessage type="error" message="Something went wrong" />);
    
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('bg-red-50', 'border-red-200');
    expect(screen.getByText('Something went wrong')).toHaveClass('text-red-700');
    
    // Check for error icon
    const svg = alert.querySelector('svg');
    expect(svg).toHaveClass('text-red-400');
  });

  it('renders warning alert correctly', () => {
    render(<AlertMessage type="warning" message="Please be careful" />);
    
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('bg-yellow-50', 'border-yellow-200');
    expect(screen.getByText('Please be careful')).toHaveClass('text-yellow-700');
  });

  it('renders info alert correctly', () => {
    render(<AlertMessage type="info" message="For your information" />);
    
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('bg-blue-50', 'border-blue-200');
    expect(screen.getByText('For your information')).toHaveClass('text-blue-700');
  });

  it('displays field errors when provided', () => {
    const errors = {
      email: 'Invalid email address',
      password: 'Password too short'
    };
    
    render(
      <AlertMessage 
        type="error" 
        message="Validation failed" 
        errors={errors}
      />
    );
    
    expect(screen.getByText('Validation failed')).toBeInTheDocument();
    expect(screen.getByText('email:')).toBeInTheDocument();
    expect(screen.getByText('Invalid email address')).toBeInTheDocument();
    expect(screen.getByText('password:')).toBeInTheDocument();
    expect(screen.getByText('Password too short')).toBeInTheDocument();
  });

  it('does not show errors section when errors object is empty', () => {
    render(
      <AlertMessage 
        type="error" 
        message="Error occurred" 
        errors={{}}
      />
    );
    
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
    expect(screen.queryByText(':')).not.toBeInTheDocument();
  });

  it('shows dismiss button when onDismiss is provided', () => {
    const handleDismiss = jest.fn();
    render(
      <AlertMessage 
        type="info" 
        message="Dismissible message" 
        onDismiss={handleDismiss}
      />
    );
    
    const dismissButton = screen.getByLabelText('Dismiss');
    expect(dismissButton).toBeInTheDocument();
    
    fireEvent.click(dismissButton);
    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not show dismiss button when onDismiss is not provided', () => {
    render(<AlertMessage type="info" message="Non-dismissible" />);
    
    expect(screen.queryByLabelText('Dismiss')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <AlertMessage 
        type="success" 
        message="Custom styled" 
        className="mt-4 mb-8"
      />
    );
    
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('mt-4', 'mb-8');
  });

  it('has proper hover states for dismiss button', () => {
    const handleDismiss = jest.fn();
    
    const { rerender } = render(
      <AlertMessage type="success" message="Test" onDismiss={handleDismiss} />
    );
    let dismissButton = screen.getByLabelText('Dismiss');
    expect(dismissButton).toHaveClass('hover:bg-green-100');
    
    rerender(
      <AlertMessage type="error" message="Test" onDismiss={handleDismiss} />
    );
    dismissButton = screen.getByLabelText('Dismiss');
    expect(dismissButton).toHaveClass('hover:bg-red-100');
    
    rerender(
      <AlertMessage type="warning" message="Test" onDismiss={handleDismiss} />
    );
    dismissButton = screen.getByLabelText('Dismiss');
    expect(dismissButton).toHaveClass('hover:bg-yellow-100');
    
    rerender(
      <AlertMessage type="info" message="Test" onDismiss={handleDismiss} />
    );
    dismissButton = screen.getByLabelText('Dismiss');
    expect(dismissButton).toHaveClass('hover:bg-blue-100');
  });

  it('renders with proper accessibility attributes', () => {
    render(<AlertMessage type="error" message="Error message" />);
    
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    
    const svg = alert.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});