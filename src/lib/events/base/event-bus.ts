import { randomUUID } from 'crypto'
import { 
  IEvent, 
  IEventBus, 
  IEventHandler, 
  EventCallback, 
  EventSubscription 
} from './event.interface'

export interface EventBusOptions {
  enableLogging?: boolean
  enableAsync?: boolean
  maxRetries?: number
  retryDelay?: number
}

export class EventBus implements IEventBus {
  private subscriptions = new Map<string, EventSubscription[]>()
  private subscriptionMap = new Map<string, EventSubscription>()
  private options: EventBusOptions
  
  constructor(options: EventBusOptions = {}) {
    this.options = {
      enableLogging: true,
      enableAsync: true,
      maxRetries: 3,
      retryDelay: 1000,
      ...options
    }
  }
  
  /**
   * Publish an event to all subscribers
   */
  async publish(event: IEvent): Promise<void> {
    if (this.options.enableLogging) {
      console.log(`[EventBus] Publishing event: ${event.type}`, {
        eventId: event.metadata.eventId,
        correlationId: event.metadata.correlationId
      })
    }
    
    // Get subscriptions for this event type
    const typeSubscriptions = this.subscriptions.get(event.type) || []
    const wildcardSubscriptions = this.subscriptions.get('*') || []
    const allSubscriptions = [...typeSubscriptions, ...wildcardSubscriptions]
    
    // Sort by priority (higher priority first)
    allSubscriptions.sort((a, b) => (b.priority || 0) - (a.priority || 0))
    
    if (allSubscriptions.length === 0 && this.options.enableLogging) {
      console.log(`[EventBus] No subscribers for event: ${event.type}`)
    }
    
    // Execute handlers
    if (this.options.enableAsync) {
      // Async execution - don't wait for handlers
      this.executeHandlersAsync(event, allSubscriptions)
    } else {
      // Sync execution - wait for all handlers
      await this.executeHandlersSync(event, allSubscriptions)
    }
  }
  
  /**
   * Publish multiple events
   */
  async publishMany(events: IEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event)
    }
  }
  
  /**
   * Subscribe to an event type
   */
  subscribe<T extends IEvent>(
    eventType: string, 
    handler: EventCallback<T>
  ): string {
    const subscription: EventSubscription = {
      id: randomUUID(),
      eventType,
      handler: {
        eventType,
        handlerName: handler.name || 'anonymous',
        handle: handler as any
      },
      priority: 0
    }
    
    this.addSubscription(subscription)
    
    if (this.options.enableLogging) {
      console.log(`[EventBus] Subscribed to: ${eventType} (${subscription.id})`)
    }
    
    return subscription.id
  }
  
  /**
   * Subscribe a handler object
   */
  subscribeHandler(handler: IEventHandler): string {
    const subscription: EventSubscription = {
      id: randomUUID(),
      eventType: handler.eventType,
      handler,
      priority: 0
    }
    
    this.addSubscription(subscription)
    
    if (this.options.enableLogging) {
      console.log(`[EventBus] Handler subscribed: ${handler.handlerName} to ${handler.eventType}`)
    }
    
    return subscription.id
  }
  
  /**
   * Unsubscribe by subscription ID
   */
  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptionMap.get(subscriptionId)
    if (!subscription) return
    
    const typeSubscriptions = this.subscriptions.get(subscription.eventType) || []
    const index = typeSubscriptions.findIndex(s => s.id === subscriptionId)
    
    if (index !== -1) {
      typeSubscriptions.splice(index, 1)
      this.subscriptionMap.delete(subscriptionId)
      
      if (this.options.enableLogging) {
        console.log(`[EventBus] Unsubscribed: ${subscriptionId} from ${subscription.eventType}`)
      }
    }
  }
  
  /**
   * Unsubscribe all handlers for an event type
   */
  unsubscribeAll(eventType?: string): void {
    if (eventType) {
      const subscriptions = this.subscriptions.get(eventType) || []
      subscriptions.forEach(s => this.subscriptionMap.delete(s.id))
      this.subscriptions.delete(eventType)
      
      if (this.options.enableLogging) {
        console.log(`[EventBus] Unsubscribed all from: ${eventType}`)
      }
    } else {
      this.subscriptions.clear()
      this.subscriptionMap.clear()
      
      if (this.options.enableLogging) {
        console.log(`[EventBus] Unsubscribed all handlers`)
      }
    }
  }
  
  /**
   * Get all subscriptions
   */
  getSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptionMap.values())
  }
  
  /**
   * Get subscriptions for a specific event type
   */
  getSubscriptionsByType(eventType: string): EventSubscription[] {
    return this.subscriptions.get(eventType) || []
  }
  
  /**
   * Add a subscription
   */
  private addSubscription(subscription: EventSubscription): void {
    const typeSubscriptions = this.subscriptions.get(subscription.eventType) || []
    typeSubscriptions.push(subscription)
    this.subscriptions.set(subscription.eventType, typeSubscriptions)
    this.subscriptionMap.set(subscription.id, subscription)
  }
  
  /**
   * Execute handlers synchronously
   */
  private async executeHandlersSync(
    event: IEvent, 
    subscriptions: EventSubscription[]
  ): Promise<void> {
    for (const subscription of subscriptions) {
      try {
        await this.executeHandler(event, subscription)
      } catch (error) {
        console.error(`[EventBus] Handler error for ${event.type}:`, error)
      }
    }
  }
  
  /**
   * Execute handlers asynchronously
   */
  private executeHandlersAsync(
    event: IEvent, 
    subscriptions: EventSubscription[]
  ): void {
    for (const subscription of subscriptions) {
      this.executeHandler(event, subscription).catch(error => {
        console.error(`[EventBus] Async handler error for ${event.type}:`, error)
      })
    }
  }
  
  /**
   * Execute a single handler with retry logic
   */
  private async executeHandler(
    event: IEvent, 
    subscription: EventSubscription
  ): Promise<void> {
    let lastError: Error | undefined
    
    for (let attempt = 1; attempt <= this.options.maxRetries!; attempt++) {
      try {
        await subscription.handler.handle(event)
        return // Success
      } catch (error) {
        lastError = error as Error
        
        if (attempt < this.options.maxRetries!) {
          if (this.options.enableLogging) {
            console.log(`[EventBus] Handler failed, retrying (${attempt}/${this.options.maxRetries}):`, {
              handler: subscription.handler.handlerName,
              event: event.type,
              error: lastError.message
            })
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, this.options.retryDelay!))
        }
      }
    }
    
    // All retries failed
    throw lastError
  }
}