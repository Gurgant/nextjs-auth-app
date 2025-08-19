import { IEvent, IEventStore, EventFilter } from '../base/event.interface'

export class InMemoryEventStore implements IEventStore {
  private events: IEvent[] = []
  private maxEvents: number
  
  constructor(maxEvents: number = 10000) {
    this.maxEvents = maxEvents
  }
  
  async append(event: IEvent): Promise<void> {
    this.events.push(event)
    
    // Maintain max size by removing oldest events
    if (this.events.length > this.maxEvents) {
      this.events.shift()
    }
  }
  
  async getEvents(filter?: EventFilter): Promise<IEvent[]> {
    let filtered = [...this.events]
    
    if (filter) {
      // Filter by type
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type]
        filtered = filtered.filter(e => types.includes(e.type))
      }
      
      // Filter by user
      if (filter.userId) {
        filtered = filtered.filter(e => e.metadata.userId === filter.userId)
      }
      
      // Filter by correlation
      if (filter.correlationId) {
        filtered = filtered.filter(e => e.metadata.correlationId === filter.correlationId)
      }
      
      // Filter by date range
      if (filter.startDate) {
        filtered = filtered.filter(e => e.metadata.timestamp >= filter.startDate!)
      }
      if (filter.endDate) {
        filtered = filtered.filter(e => e.metadata.timestamp <= filter.endDate!)
      }
      
      // Apply pagination
      const offset = filter.offset || 0
      const limit = filter.limit || filtered.length
      filtered = filtered.slice(offset, offset + limit)
    }
    
    return filtered
  }
  
  async getEventsByType(type: string, limit?: number): Promise<IEvent[]> {
    const events = this.events
      .filter(e => e.type === type)
      .slice(-(limit || 100))
    
    return events
  }
  
  async getEventsByUser(userId: string, limit?: number): Promise<IEvent[]> {
    const events = this.events
      .filter(e => e.metadata.userId === userId)
      .slice(-(limit || 100))
    
    return events
  }
  
  async getEventsByCorrelation(correlationId: string): Promise<IEvent[]> {
    return this.events.filter(e => e.metadata.correlationId === correlationId)
  }
  
  async getEventCount(): Promise<number> {
    return this.events.length
  }
  
  /**
   * Clear all events
   */
  clear(): void {
    this.events = []
  }
  
  /**
   * Get all events (for debugging)
   */
  getAllEvents(): IEvent[] {
    return [...this.events]
  }
  
  /**
   * Get event statistics
   */
  getStats(): {
    totalEvents: number
    eventTypes: Map<string, number>
    userEvents: Map<string, number>
    oldestEvent?: Date
    newestEvent?: Date
  } {
    const stats = {
      totalEvents: this.events.length,
      eventTypes: new Map<string, number>(),
      userEvents: new Map<string, number>(),
      oldestEvent: this.events[0]?.metadata.timestamp,
      newestEvent: this.events[this.events.length - 1]?.metadata.timestamp
    }
    
    for (const event of this.events) {
      // Count by type
      const typeCount = stats.eventTypes.get(event.type) || 0
      stats.eventTypes.set(event.type, typeCount + 1)
      
      // Count by user
      if (event.metadata.userId) {
        const userCount = stats.userEvents.get(event.metadata.userId) || 0
        stats.userEvents.set(event.metadata.userId, userCount + 1)
      }
    }
    
    return stats
  }
}