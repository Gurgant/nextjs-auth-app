import React from 'react'
import { render } from '@testing-library/react'
import { FormPageLayout } from '../form-page-layout'

// Mock the sub-components
jest.mock('../gradient-page-layout', () => ({
  GradientPageLayout: ({ children, gradient }: any) => (
    <div data-testid="gradient-layout" data-gradient={gradient}>
      {children}
    </div>
  )
}))

jest.mock('../centered-content-layout', () => ({
  CenteredContentLayout: ({ children, maxWidth }: any) => (
    <div data-testid="centered-layout" data-maxwidth={maxWidth}>
      {children}
    </div>
  )
}))

describe('FormPageLayout', () => {
  it('renders children correctly', () => {
    const { getByText } = render(
      <FormPageLayout>
        <div>Test Form</div>
      </FormPageLayout>
    )
    
    expect(getByText('Test Form')).toBeInTheDocument()
  })

  it('composes gradient and centered layouts', () => {
    const { getByTestId } = render(
      <FormPageLayout>
        <div>Form</div>
      </FormPageLayout>
    )
    
    const gradientLayout = getByTestId('gradient-layout')
    const centeredLayout = getByTestId('centered-layout')
    
    expect(gradientLayout).toBeInTheDocument()
    expect(centeredLayout).toBeInTheDocument()
    
    // Check nesting
    expect(gradientLayout).toContainElement(centeredLayout)
  })

  it('passes default props correctly', () => {
    const { getByTestId } = render(
      <FormPageLayout>
        <div>Form</div>
      </FormPageLayout>
    )
    
    const gradientLayout = getByTestId('gradient-layout')
    const centeredLayout = getByTestId('centered-layout')
    
    expect(gradientLayout).toHaveAttribute('data-gradient', 'default')
    expect(centeredLayout).toHaveAttribute('data-maxwidth', 'md')
  })

  it('passes custom gradient prop', () => {
    const { getByTestId } = render(
      <FormPageLayout gradient="green-blue">
        <div>Form</div>
      </FormPageLayout>
    )
    
    const gradientLayout = getByTestId('gradient-layout')
    expect(gradientLayout).toHaveAttribute('data-gradient', 'green-blue')
  })

  it('passes custom maxWidth prop', () => {
    const { getByTestId } = render(
      <FormPageLayout maxWidth="lg">
        <div>Form</div>
      </FormPageLayout>
    )
    
    const centeredLayout = getByTestId('centered-layout')
    expect(centeredLayout).toHaveAttribute('data-maxwidth', 'lg')
  })

  it('passes all custom props correctly', () => {
    const { getByTestId } = render(
      <FormPageLayout gradient="purple-pink" maxWidth="sm">
        <div>Form</div>
      </FormPageLayout>
    )
    
    const gradientLayout = getByTestId('gradient-layout')
    const centeredLayout = getByTestId('centered-layout')
    
    expect(gradientLayout).toHaveAttribute('data-gradient', 'purple-pink')
    expect(centeredLayout).toHaveAttribute('data-maxwidth', 'sm')
  })
})