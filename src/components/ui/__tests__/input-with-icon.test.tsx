import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InputWithIcon } from '../input-with-icon';

describe('InputWithIcon', () => {
  it('renders email input with mail icon', () => {
    render(
      <InputWithIcon 
        icon="mail" 
        type="email" 
        placeholder="Enter email"
      />
    );
    
    const input = screen.getByPlaceholderText('Enter email');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'email');
    
    // Check for icon presence (Mail icon has specific attributes)
    const icon = input.parentElement?.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('h-5', 'w-5', 'text-gray-400');
  });

  it('renders password input with lock icon', () => {
    render(
      <InputWithIcon 
        icon="lock" 
        type="password" 
        placeholder="Enter password"
      />
    );
    
    const input = screen.getByPlaceholderText('Enter password');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('renders user input with user icon', () => {
    render(
      <InputWithIcon 
        icon="user" 
        type="text" 
        placeholder="Enter name"
      />
    );
    
    const input = screen.getByPlaceholderText('Enter name');
    expect(input).toHaveAttribute('type', 'text');
  });

  it('shows error state correctly', () => {
    const errorMessage = 'Email is required';
    render(
      <InputWithIcon 
        icon="mail" 
        type="email" 
        error={errorMessage}
      />
    );
    
    const errorElement = screen.getByRole('alert');
    expect(errorElement).toHaveTextContent(errorMessage);
    expect(errorElement).toHaveClass('text-red-600');
    
    // Check icon color changes to red on error
    const icon = document.querySelector('svg');
    expect(icon).toHaveClass('text-red-400');
    
    // Check input has error styling
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('border-red-300');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('handles value changes', async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();
    
    render(
      <InputWithIcon 
        icon="mail" 
        type="email" 
        onChange={handleChange}
        placeholder="Email"
      />
    );
    
    const input = screen.getByPlaceholderText('Email');
    await user.type(input, 'test@example.com');
    
    expect(handleChange).toHaveBeenCalled();
  });

  it('shows password toggle for password inputs', () => {
    render(
      <InputWithIcon 
        icon="lock" 
        type="password" 
        showPasswordToggle
        placeholder="Password"
      />
    );
    
    const toggleButton = screen.getByLabelText('Show password');
    expect(toggleButton).toBeInTheDocument();
    
    const input = screen.getByPlaceholderText('Password');
    expect(input).toHaveAttribute('type', 'password');
    
    // Click toggle to show password
    fireEvent.click(toggleButton);
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Hide password')).toBeInTheDocument();
    
    // Click again to hide password
    fireEvent.click(screen.getByLabelText('Hide password'));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('does not show password toggle when not requested', () => {
    render(
      <InputWithIcon 
        icon="lock" 
        type="password" 
        placeholder="Password"
      />
    );
    
    expect(screen.queryByLabelText('Show password')).not.toBeInTheDocument();
  });

  it('applies custom focus ring colors', () => {
    const { rerender } = render(
      <InputWithIcon icon="mail" focusRing="green" />
    );
    
    let input = screen.getByRole('textbox');
    expect(input).toHaveClass('focus:ring-green-500');
    
    rerender(<InputWithIcon icon="mail" focusRing="purple" />);
    input = screen.getByRole('textbox');
    expect(input).toHaveClass('focus:ring-purple-500');
    
    rerender(<InputWithIcon icon="mail" focusRing="red" />);
    input = screen.getByRole('textbox');
    expect(input).toHaveClass('focus:ring-red-500');
  });

  it('renders with label', () => {
    render(
      <InputWithIcon 
        icon="mail" 
        label="Email Address"
        placeholder="Enter email"
      />
    );
    
    const label = screen.getByText('Email Address');
    expect(label).toBeInTheDocument();
    expect(label).toHaveClass('text-sm', 'font-semibold');
    
    const input = screen.getByPlaceholderText('Enter email');
    expect(label).toHaveAttribute('for', input.id);
  });

  it('renders with visually hidden label', () => {
    render(
      <InputWithIcon 
        icon="mail" 
        label="Email Address"
        srOnlyLabel
      />
    );
    
    const label = screen.getByText('Email Address');
    expect(label).toHaveClass('sr-only');
  });

  it('forwards ref correctly', () => {
    const ref = jest.fn();
    render(<InputWithIcon icon="mail" ref={ref} />);
    
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLInputElement);
  });

  it('passes through additional props', () => {
    render(
      <InputWithIcon 
        icon="mail" 
        name="email"
        autoComplete="email"
        required
        data-testid="email-input"
      />
    );
    
    const input = screen.getByTestId('email-input');
    expect(input).toHaveAttribute('name', 'email');
    expect(input).toHaveAttribute('autoComplete', 'email');
    expect(input).toHaveAttribute('required');
  });

  it('applies custom className', () => {
    render(
      <InputWithIcon 
        icon="mail" 
        className="custom-class"
      />
    );
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('custom-class');
  });

  it('handles disabled state', () => {
    render(
      <InputWithIcon 
        icon="mail" 
        disabled
        placeholder="Disabled input"
      />
    );
    
    const input = screen.getByPlaceholderText('Disabled input');
    expect(input).toBeDisabled();
  });

  it('generates unique IDs for multiple instances', () => {
    render(
      <>
        <InputWithIcon icon="mail" />
        <InputWithIcon icon="lock" />
      </>
    );
    
    const inputs = screen.getAllByRole('textbox');
    expect(inputs[0].id).not.toBe(inputs[1].id);
  });

  it('uses provided ID when specified', () => {
    render(
      <InputWithIcon 
        icon="mail" 
        id="custom-email-input"
      />
    );
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('id', 'custom-email-input');
  });
});